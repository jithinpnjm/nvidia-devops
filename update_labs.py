import sys

def modify_labs():
    with open('src/pages/labs.tsx', 'r') as f:
        content = f.read()

    new_labs = """  {id:'async-retry',title:'46 · Async Exponential Backoff',prompt:'Write an async decorator or function that retries an unstable async network call (mocked here) up to 3 times, waiting 0.1s, 0.2s, then 0.4s. Synchronous `time.sleep()` would block the FastAPI event loop; you must use `asyncio.sleep`.',starter:`import asyncio

async def fetch_status():
    # This mock fails twice, then succeeds.
    fetch_status.calls += 1
    if fetch_status.calls < 3:
        raise ConnectionError("Network blip")
    return "OK"
fetch_status.calls = 0

async def fetch_with_retry(func):
    # Implement exponential backoff here using await asyncio.sleep()
    pass

# Tests will await your function
`,expected:"'OK' after 2 retries",tests:`import asyncio
import time

start = time.time()
result = await fetch_with_retry(fetch_status)
duration = time.time() - start

assert result == "OK", f"Expected 'OK', got {result}"
assert fetch_status.calls == 3, f"Expected 3 calls, got {fetch_status.calls}"
assert duration >= 0.3, f"Backoff too fast, took {duration}s"
print('PASS')`,hint:'Use a for loop `for attempt in range(max_attempts):`. Try/except the error. On fail, `await asyncio.sleep(delay)`, then double the delay.',solution:`import asyncio

async def fetch_with_retry(func, max_attempts=3):
    delay = 0.1
    for attempt in range(max_attempts):
        try:
            return await func()
        except Exception as e:
            if attempt == max_attempts - 1:
                raise
            await asyncio.sleep(delay)
            delay *= 2`,explanation:'In a FastAPI or AsyncIO microservice, a synchronous `time.sleep()` or `requests.get()` freezes the entire server, causing hundreds of concurrent requests to queue up and timeout. You must use `await asyncio.sleep()` for backoff to yield control back to the event loop.'},
  {id:'json-validation',title:'47 · Strict JSON Validation',prompt:'Write a function that parses a raw JSON payload (a string) representing an infrastructure request. It must enforce that `gpu_count` is an integer between 1 and 8, and `image` is a string. If validation fails or JSON is malformed, raise a ValueError.',starter:`import json

def validate_job_payload(raw_json: str) -> dict:
    # Parse the json.
    # Validate gpu_count (int, 1-8) and image (str).
    # Return the parsed dict if valid, else raise ValueError.
    return {}

payload = '{"gpu_count": 4, "image": "nvcr.io/cuda:12.1"}'
print(validate_job_payload(payload))`,expected:"{'gpu_count': 4, 'image': 'nvcr.io/cuda:12.1'}",tests:`
try:
    validate_job_payload('malformed')
    assert False, "Should raise ValueError on bad JSON"
except ValueError:
    pass

try:
    validate_job_payload('{"gpu_count": 10, "image": "ubuntu"}')
    assert False, "Should raise ValueError on gpu_count > 8"
except ValueError:
    pass

try:
    validate_job_payload('{"gpu_count": "4", "image": "ubuntu"}')
    assert False, "Should raise ValueError on string gpu_count"
except ValueError:
    pass

assert validate_job_payload('{"gpu_count": 4, "image": "ubuntu"}')["gpu_count"] == 4
print('PASS')`,hint:'Use `json.loads(raw_json)`. Catch `json.JSONDecodeError` and re-raise as `ValueError`. Check `type(data["gpu_count"]) is int`.',solution:`import json

def validate_job_payload(raw_json):
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        raise ValueError("Invalid JSON format")
        
    if "gpu_count" not in data or "image" not in data:
        raise ValueError("Missing required fields")
        
    if type(data["gpu_count"]) is not int or not (1 <= data["gpu_count"] <= 8):
        raise ValueError("gpu_count must be an integer between 1 and 8")
        
    if type(data["image"]) is not str:
        raise ValueError("image must be a string")
        
    return data`,explanation:'In modern Python microservices, this manual validation is usually fully automated by Pydantic (used deeply in FastAPI). Validating inputs at the absolute edge of your API guarantees that deeply nested infrastructure logic never crashes due to a string being passed where a math operation expected an integer.'},
  {id:'async-gather',title:'48 · Concurrent API Aggregation',prompt:'You need to fetch the health status of 3 different Kubernetes clusters. Doing this synchronously takes 3x the latency. Use `asyncio.gather` to fetch all 3 concurrently and return a dictionary mapping the cluster ID to its status.',starter:`import asyncio

async def fetch_cluster(cluster_id: str) -> str:
    await asyncio.sleep(0.1) # Simulate network latency
    return "healthy" if cluster_id != "cluster-2" else "degraded"

async def check_all_clusters(clusters: list[str]) -> dict:
    # Use asyncio.gather to run fetch_cluster for all clusters concurrently.
    # Return a dict mapping cluster_id -> status
    pass
`,expected:"{'cluster-1': 'healthy', 'cluster-2': 'degraded', 'cluster-3': 'healthy'}",tests:`import time

start = time.time()
results = await check_all_clusters(["cluster-1", "cluster-2", "cluster-3"])
duration = time.time() - start

assert results == {"cluster-1": "healthy", "cluster-2": "degraded", "cluster-3": "healthy"}
assert duration < 0.2, "Execution took too long; tasks were not run concurrently."
print('PASS')`,hint:'Create a list of awaitables: `tasks = [fetch_cluster(c) for c in clusters]`. Then `results = await asyncio.gather(*tasks)`. Zip the original clusters with the results to build the dictionary.',solution:`import asyncio

async def check_all_clusters(clusters):
    # Create the concurrent tasks
    tasks = [fetch_cluster(c) for c in clusters]
    
    # Await them all at once
    statuses = await asyncio.gather(*tasks)
    
    # Combine the inputs with the outputs
    return dict(zip(clusters, statuses))`,explanation:'When building a control-plane API or dashboard backend, a single request often needs data from multiple backend APIs. Sequential awaiting (`await a()`, then `await b()`) ruins performance. `asyncio.gather` fires them simultaneously, bounding the total latency to the single slowest request.'},
  {id:'file-batching',title:'49 · Memory-Safe Generator',prompt:'You need to parse a 50GB JSONL log file. Reading `file.readlines()` will OOM-kill your container. Write a Python generator function `process_logs` that yields one parsed JSON dict at a time from a list of strings, filtering out logs where `level != "ERROR"`.',starter:`import json

def process_logs(lines: list[str]):
    # Do not return a full list! Use the 'yield' keyword.
    # Parse each line with json.loads. 
    # Only yield the dictionary if data['level'] == 'ERROR'
    pass

logs = [
    '{"level": "INFO", "msg": "started"}',
    '{"level": "ERROR", "msg": "CUDA OOM"}',
    '{"level": "ERROR", "msg": "Node lost"}'
]
for error in process_logs(logs):
    print(error['msg'])`,expected:"'CUDA OOM' then 'Node lost'",tests:`
logs = [
    '{"level": "INFO", "msg": "a"}',
    '{"level": "ERROR", "msg": "b"}',
    '{"level": "WARN", "msg": "c"}',
    '{"level": "ERROR", "msg": "d"}'
]

gen = process_logs(logs)
import types
assert isinstance(gen, types.GeneratorType), "Function must be a generator (use yield, not return)"

results = list(gen)
assert len(results) == 2
assert results[0]['msg'] == 'b'
assert results[1]['msg'] == 'd'
print('PASS')`,hint:'Loop over the lines. Inside the loop, parse the json. If the level is ERROR, use `yield data` instead of `return` or appending to a list.',solution:`import json

def process_logs(lines):
    for line in lines:
        try:
            data = json.loads(line)
            if data.get('level') == 'ERROR':
                yield data
        except json.JSONDecodeError:
            continue`,explanation:'Generators (`yield`) are mandatory for Data/AI Infrastructure. Whether you are streaming a 50GB dataset into a training loop, paginating through 10,000 Kubernetes pods, or exporting billing metrics, returning a massive list will exhaust memory and kill the pod. Generators keep the memory footprint bounded to exactly 1 item at a time.'},
"""

    # Insert new labs before the ending ]; of const labs
    target = "];\n\nconst labGroups:"
    if target not in content:
        print("Could not find target to insert labs")
        sys.exit(1)
        
    content = content.replace(target, new_labs + target)
    
    # Add Tier 5 to labGroups
    tier_4 = "{name: 'Tier 4 — General SRE Python & software design', ids: ['access-log-summary', 'latency-percentile', 'alert-dedup', 'slo-burn', 'dependency-order', 'config-precedence', 'circuit-breaker', 'token-bucket', 'retry-budget', 'pod-capacity-fit', 'subnet-overlap', 'certificate-expiry', 'backup-retention', 'quorum-health', 'rollout-gate']},"
    tier_5 = "\n  {name: 'Tier 5 — Advanced Microservices & Async Ops (Senior)', ids: ['async-retry', 'json-validation', 'async-gather', 'file-batching']},"
    
    content = content.replace(tier_4, tier_4 + tier_5)
    
    with open('src/pages/labs.tsx', 'w') as f:
        f.write(content)
        
modify_labs()
