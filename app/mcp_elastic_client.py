"""
Elasticsearch (Kibana Agent Builder) MCP client over the Streamable-HTTP transport.

Talks JSON-RPC 2.0 to {KIBANA_URL}/api/agent_builder/mcp using httpx, exactly per
the MCP Streamable-HTTP spec:
  - POST every JSON-RPC message; Accept: application/json, text/event-stream
  - `initialize` -> capture the Mcp-Session-Id response header
  - send `notifications/initialized`
  - `tools/list` to discover, `tools/call` to execute (list_indices, get_mappings, search, esql, get_shards)

Hackathon rule: 100% LIVE. No mock data, no scaffolding fallback. If KIBANA_URL or
ELASTIC_API_KEY is unset, or the server rejects us (401/403), we raise ElasticMCPError
immediately with a clear, surfaceable message.
"""
from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv

MCP_PROTOCOL_VERSION = "2025-06-18"
_CLIENT_INFO = {"name": "civicsync-courtroom", "version": "2.0.0"}

# Current Agent Builder MCP registers platform_core_* tools (not legacy short names).
_TOOL_ALIASES: Dict[str, str] = {
    "list_indices": "platform_core_list_indices",
    "get_mappings": "platform_core_get_index_mapping",
    "search": "platform_core_search",
    "esql": "platform_core_execute_esql",
}


class ElasticMCPError(RuntimeError):
    """Raised for any failure talking to the Elasticsearch MCP server."""

    def __init__(self, message: str, *, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class ElasticMCPClient:
    """Synchronous MCP Streamable-HTTP client for the Kibana Agent Builder server."""

    def __init__(
        self,
        kibana_url: Optional[str] = None,
        api_key: Optional[str] = None,
        space: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.kibana_url = (kibana_url or os.getenv("KIBANA_URL", "")).strip().rstrip("/")
        self.api_key = (api_key or os.getenv("ELASTIC_API_KEY", "")).strip()
        self.space = (space if space is not None else os.getenv("KIBANA_SPACE", "")).strip()
        self.timeout = timeout
        self._insecure = os.getenv("ELASTIC_INSECURE_TLS", "0").strip() in ("1", "true", "True")

        self._session_id: Optional[str] = None
        self._negotiated_version: str = MCP_PROTOCOL_VERSION
        self._server_info: Dict[str, Any] = {}
        self._http: Optional[httpx.Client] = None
        self._rpc_id = 0
        self._connected = False

    # ── configuration helpers ───────────────────────────────────────────
    @property
    def configured(self) -> bool:
        return bool(self.kibana_url and self.api_key)

    @staticmethod
    def _looks_like_elasticsearch_cluster_url(url: str) -> bool:
        """Elastic Cloud ES endpoints use *.es.<region>.* — MCP lives on Kibana (*.kb.*)."""
        lowered = url.lower()
        return ".es." in lowered and ".kb." not in lowered

    @property
    def endpoint(self) -> str:
        if not self.kibana_url:
            raise ElasticMCPError("KIBANA_URL is not set; cannot build the MCP endpoint.")
        if self._looks_like_elasticsearch_cluster_url(self.kibana_url):
            raise ElasticMCPError(
                "KIBANA_URL points at the Elasticsearch cluster (hostname contains '.es.'). "
                "Agent Builder MCP is served by Kibana — use your Kibana endpoint instead "
                "(Elastic Cloud: *.kb.<region>.gcp.elastic.cloud, port 443). "
                "Copy it from Elastic Cloud → your deployment → Kibana → copy endpoint."
            )
        if self.space and self.space != "default":
            return f"{self.kibana_url}/s/{self.space}/api/agent_builder/mcp"
        return f"{self.kibana_url}/api/agent_builder/mcp"

    @property
    def elasticsearch_url(self) -> str:
        """Cluster URL for raw Query DSL (_search). Derived from Kibana host when unset."""
        explicit = os.getenv("ELASTICSEARCH_URL", "").strip().rstrip("/")
        if explicit:
            return explicit
        if self.kibana_url and ".kb." in self.kibana_url.lower():
            return self.kibana_url.replace(".kb.", ".es.", 1)
        return self.kibana_url

    @property
    def masked_endpoint(self) -> str:
        if not self.kibana_url:
            return "(KIBANA_URL unset)"
        try:
            return self.endpoint
        except ElasticMCPError as e:
            return f"{self.kibana_url}/api/agent_builder/mcp — {e}"

    def _client(self) -> httpx.Client:
        if self._http is None:
            self._http = httpx.Client(timeout=self.timeout, verify=not self._insecure)
        return self._http

    def _headers(self) -> Dict[str, str]:
        h = {
            "Authorization": f"ApiKey {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": self._negotiated_version,
        }
        if self._session_id:
            h["Mcp-Session-Id"] = self._session_id
        return h

    def _next_id(self) -> int:
        self._rpc_id += 1
        return self._rpc_id

    # ── low-level JSON-RPC over Streamable-HTTP ──────────────────────────
    def _parse_response(self, resp: httpx.Response, request_id: Optional[int]) -> Optional[dict]:
        """Return the JSON-RPC message matching request_id (handles JSON or SSE bodies)."""
        ctype = resp.headers.get("content-type", "")
        # capture/refresh session id whenever the server issues one
        sid = resp.headers.get("mcp-session-id") or resp.headers.get("Mcp-Session-Id")
        if sid:
            self._session_id = sid

        if resp.status_code == 202:
            return None  # accepted notification, no body

        if resp.status_code in (401, 403):
            raise ElasticMCPError(
                f"Elasticsearch MCP authorization failed ({resp.status_code}). "
                f"Check ELASTIC_API_KEY and that it has feature_agentBuilder.read on space "
                f"'{self.space or 'default'}'.",
                status_code=resp.status_code,
            )
        if resp.status_code >= 400:
            raise ElasticMCPError(
                f"Elasticsearch MCP HTTP {resp.status_code}: {resp.text[:300]}",
                status_code=resp.status_code,
            )

        messages: List[dict] = []
        if "text/event-stream" in ctype:
            for line in resp.text.splitlines():
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                payload = line[len("data:"):].strip()
                if not payload or payload == "[DONE]":
                    continue
                try:
                    messages.append(json.loads(payload))
                except json.JSONDecodeError:
                    continue
        else:
            body = resp.text.strip()
            if not body:
                return None
            try:
                parsed = json.loads(body)
            except json.JSONDecodeError as e:
                raise ElasticMCPError(f"Invalid JSON from MCP server: {e}; body={body[:200]}")
            messages = parsed if isinstance(parsed, list) else [parsed]

        # find the matching response (ignore server-initiated notifications)
        chosen: Optional[dict] = None
        for m in messages:
            if not isinstance(m, dict):
                continue
            if request_id is not None and m.get("id") == request_id:
                chosen = m
                break
            if request_id is None and ("result" in m or "error" in m):
                chosen = m
        if chosen is None and messages:
            chosen = next((m for m in messages if "result" in m or "error" in m), None)

        if chosen and "error" in chosen and chosen["error"]:
            err = chosen["error"]
            raise ElasticMCPError(
                f"MCP JSON-RPC error {err.get('code')}: {err.get('message')} "
                f"{json.dumps(err.get('data')) if err.get('data') else ''}".strip()
            )
        return chosen

    def _rpc(self, method: str, params: Optional[dict] = None) -> dict:
        rid = self._next_id()
        body: Dict[str, Any] = {"jsonrpc": "2.0", "id": rid, "method": method}
        if params is not None:
            body["params"] = params
        try:
            resp = self._client().post(self.endpoint, headers=self._headers(), json=body)
        except httpx.TimeoutException as e:
            raise ElasticMCPError(f"Elasticsearch MCP timed out after {self.timeout}s ({method}): {e}")
        except httpx.HTTPError as e:
            raise ElasticMCPError(f"Could not reach Elasticsearch MCP ({method}): {e}")

        # A stale session yields 404 -> re-handshake once, then retry.
        if resp.status_code == 404 and self._session_id and method != "initialize":
            self._session_id = None
            self._connected = False
            self.connect()
            resp = self._client().post(self.endpoint, headers=self._headers(), json=body)

        msg = self._parse_response(resp, rid)
        if msg is None:
            raise ElasticMCPError(f"Empty response from MCP server for '{method}'.")
        return msg.get("result", {})

    def _notify(self, method: str, params: Optional[dict] = None) -> None:
        body: Dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            body["params"] = params
        try:
            resp = self._client().post(self.endpoint, headers=self._headers(), json=body)
            self._parse_response(resp, None)
        except httpx.HTTPError as e:
            raise ElasticMCPError(f"MCP notification '{method}' failed: {e}")

    # ── lifecycle ────────────────────────────────────────────────────────
    def connect(self) -> Dict[str, Any]:
        """Perform the initialize handshake. Raises ElasticMCPError on any failure."""
        if not self.kibana_url:
            raise ElasticMCPError(
                "KIBANA_URL is not set. The courtroom requires a live Elasticsearch MCP "
                "connection — configure KIBANA_URL in your environment (no mock fallback)."
            )
        if not self.api_key:
            raise ElasticMCPError(
                "ELASTIC_API_KEY is not set. Configure an Agent Builder API key "
                "(feature_agentBuilder.read) — no mock fallback."
            )
        result = self._rpc(
            "initialize",
            {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": _CLIENT_INFO,
            },
        )
        self._negotiated_version = result.get("protocolVersion", MCP_PROTOCOL_VERSION)
        self._server_info = result.get("serverInfo", {})
        # required per spec to complete the lifecycle
        self._notify("notifications/initialized")
        self._connected = True
        return {
            "protocolVersion": self._negotiated_version,
            "serverInfo": self._server_info,
            "session_id": self._session_id,
        }

    def ensure_connected(self) -> None:
        if not self._connected:
            self.connect()

    def close(self) -> None:
        if self._http is not None:
            self._http.close()
            self._http = None
        self._connected = False
        self._session_id = None

    # ── tools ─────────────────────────────────────────────────────────────
    def list_tools(self) -> List[Dict[str, Any]]:
        self.ensure_connected()
        result = self._rpc("tools/list")
        return result.get("tools", [])

    def _resolve_tool_name(self, name: str) -> str:
        return _TOOL_ALIASES.get(name, name)

    def _normalize_tool_args(self, name: str, arguments: dict) -> dict:
        if name in ("get_mappings", "platform_core_get_index_mapping"):
            if "indices" not in arguments and "index" in arguments:
                return {"indices": [arguments["index"]], **{k: v for k, v in arguments.items() if k != "index"}}
        return arguments

    def call_tool(self, name: str, arguments: Optional[dict] = None) -> Dict[str, Any]:
        """Execute a tool. Returns {text, json, raw}. Raises on isError."""
        self.ensure_connected()
        resolved = self._resolve_tool_name(name)
        args = self._normalize_tool_args(resolved, dict(arguments or {}))
        result = self._rpc("tools/call", {"name": resolved, "arguments": args})

        content = result.get("content", []) or []
        texts: List[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                texts.append(block.get("text", ""))
        joined = "\n".join(t for t in texts if t)

        parsed_json: Any = result.get("structuredContent")
        if parsed_json is None and joined:
            try:
                parsed_json = json.loads(joined)
            except json.JSONDecodeError:
                parsed_json = None

        if result.get("isError"):
            raise ElasticMCPError(f"MCP tool '{name}' returned an error: {joined[:400] or result}")

        return {"text": joined, "json": parsed_json, "raw": result}

    # ── domain convenience wrappers ───────────────────────────────────────
    def list_indices(self, pattern: str = "*") -> Dict[str, Any]:
        return self.call_tool("list_indices", {"pattern": pattern})

    def list_cluster_indices(self, pattern: str = "*") -> List[str]:
        """List index names via the Elasticsearch _cat/indices API (cluster truth source)."""
        if not self.api_key:
            return []
        es_url = self.elasticsearch_url
        if not es_url:
            return []
        path = f"{es_url.rstrip('/')}/_cat/indices/{pattern}?format=json&h=index"
        headers = {"Authorization": f"ApiKey {self.api_key}"}
        try:
            resp = self._client().get(path, headers=headers, timeout=self.timeout)
            if resp.status_code >= 400:
                return []
            rows = resp.json()
            if not isinstance(rows, list):
                return []
            return [str(r.get("index", "")) for r in rows if r.get("index")]
        except httpx.HTTPError:
            return []

    def get_mappings(self, index: str) -> Dict[str, Any]:
        return self.call_tool("get_mappings", {"index": index})

    def search_dsl(self, index: str, body: dict) -> Dict[str, Any]:
        """Execute approved Query DSL against the Elasticsearch cluster (live _search API)."""
        if not self.api_key:
            raise ElasticMCPError("ELASTIC_API_KEY is not set.")
        es_url = self.elasticsearch_url
        if not es_url:
            raise ElasticMCPError(
                "Cannot resolve ELASTICSEARCH_URL. Set it explicitly or configure KIBANA_URL (*.kb.*)."
            )
        url = f"{es_url.rstrip('/')}/{index}/_search"
        headers = {
            "Authorization": f"ApiKey {self.api_key}",
            "Content-Type": "application/json",
        }
        try:
            resp = self._client().post(url, headers=headers, json=body, timeout=self.timeout)
        except httpx.TimeoutException as e:
            raise ElasticMCPError(f"Elasticsearch _search timed out after {self.timeout}s: {e}")
        except httpx.HTTPError as e:
            raise ElasticMCPError(f"Could not reach Elasticsearch cluster for _search: {e}")
        if resp.status_code in (401, 403):
            raise ElasticMCPError(
                f"Elasticsearch authorization failed ({resp.status_code}). "
                "Check ELASTIC_API_KEY has read access to the target index.",
                status_code=resp.status_code,
            )
        if resp.status_code >= 400:
            raise ElasticMCPError(
                f"Elasticsearch _search HTTP {resp.status_code}: {resp.text[:400]}",
                status_code=resp.status_code,
            )
        try:
            parsed = resp.json()
        except json.JSONDecodeError as e:
            raise ElasticMCPError(f"Invalid JSON from Elasticsearch _search: {e}")
        return {"text": json.dumps(parsed), "json": parsed, "raw": parsed}

    def search(self, index: str, query: dict, **extra: Any) -> Dict[str, Any]:
        body: Dict[str, Any] = dict(query) if "query" in query else {"query": query}
        body.update(extra)
        return self.search_dsl(index, body)

    def esql(self, query: str) -> Dict[str, Any]:
        return self.call_tool("esql", {"query": query})

    # ── diagnostics / health ──────────────────────────────────────────────
    def health(self) -> Dict[str, Any]:
        """Timed connectivity probe for the UI diagnostics console."""
        if not self.configured:
            return {
                "connected": False,
                "configured": False,
                "endpoint": self.masked_endpoint,
                "error": "KIBANA_URL / ELASTIC_API_KEY not set.",
            }
        t0 = time.perf_counter()
        try:
            self._connected = False
            self._session_id = None
            info = self.connect()
            tools = self.list_tools()
            latency_ms = round((time.perf_counter() - t0) * 1000, 1)
            return {
                "connected": True,
                "configured": True,
                "endpoint": self.endpoint,
                "space": self.space or "default",
                "protocol_version": info["protocolVersion"],
                "server_info": info["serverInfo"],
                "session_id": self._session_id,
                "latency_ms": latency_ms,
                "tools": [t.get("name") for t in tools],
            }
        except ElasticMCPError as e:
            return {
                "connected": False,
                "configured": True,
                "endpoint": self.masked_endpoint,
                "error": str(e),
                "status_code": e.status_code,
                "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
            }


# Module-level singleton (per worker process)
_mcp_client: Optional[ElasticMCPClient] = None


def get_mcp_client() -> ElasticMCPClient:
    """Return a process singleton, reloading .env and recreating if credentials changed."""
    global _mcp_client
    load_dotenv(override=True)
    url = os.getenv("KIBANA_URL", "").strip().rstrip("/")
    key = os.getenv("ELASTIC_API_KEY", "").strip()
    space = os.getenv("KIBANA_SPACE", "").strip()
    if (
        _mcp_client is None
        or _mcp_client.kibana_url != url
        or _mcp_client.api_key != key
        or _mcp_client.space != space
    ):
        if _mcp_client is not None:
            _mcp_client.close()
        _mcp_client = ElasticMCPClient(kibana_url=url, api_key=key, space=space)
    return _mcp_client
