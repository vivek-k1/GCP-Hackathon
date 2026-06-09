import os
import sys
import hashlib
import requests

_cache: dict = {}


def _bhashini_translate(text: str) -> str:
    user_id = os.getenv("BHASHINI_USER_ID", "")
    api_key = os.getenv("BHASHINI_API_KEY", "")

    if not user_id or not api_key:
        raise RuntimeError("Bhashini credentials not set")

    # Step 1: get pipeline config
    pipeline_url = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
    config_resp = requests.post(
        pipeline_url,
        headers={"userID": user_id, "ulcaApiKey": api_key},
        json={
            "pipelineTasks": [{"taskType": "translation", "config": {"language": {"sourceLanguage": "en", "targetLanguage": "hi"}}}],
            "pipelineRequestConfig": {"pipelineId": "64392f96daac500b55c543cd"},
        },
        timeout=10,
    )
    config_resp.raise_for_status()
    config_data = config_resp.json()

    service_id = config_data["pipelineResponseConfig"][0]["taskSequence"][0]["serviceId"]
    inference_url = config_data["pipelineInferenceAPIEndPoint"]["callbackUrl"]
    auth_key = config_data["pipelineInferenceAPIEndPoint"]["inferenceApiKey"]["name"]
    auth_value = config_data["pipelineInferenceAPIEndPoint"]["inferenceApiKey"]["value"]

    # Step 2: translate
    trans_resp = requests.post(
        inference_url,
        headers={auth_key: auth_value},
        json={
            "pipelineTasks": [{"taskType": "translation", "config": {"language": {"sourceLanguage": "en", "targetLanguage": "hi"}, "serviceId": service_id}}],
            "inputData": {"input": [{"source": text}]},
        },
        timeout=15,
    )
    trans_resp.raise_for_status()
    return trans_resp.json()["pipelineResponse"][0]["output"][0]["target"]


def translate_to_hindi(text: str) -> str:
    """Translate English text to Hindi via Bhashini. Returns original on failure."""
    cache_key = hashlib.md5(text.encode()).hexdigest()
    if cache_key in _cache:
        return _cache[cache_key]

    try:
        hindi = _bhashini_translate(text)
        _cache[cache_key] = hindi
        return hindi
    except Exception as e:
        print(f"[WARN] Bhashini translation failed: {e}")
        return text  # Graceful fallback
