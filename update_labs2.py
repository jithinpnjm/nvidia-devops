import sys

def modify_labs():
    with open('src/pages/labs.tsx', 'r') as f:
        content = f.read()

    new_labs = """  {id:'oop-polymorphism',title:'50 · OOP Polymorphism: Cloud Provider Interface',prompt:'Design a base class `CloudProvider` with a `provision_node` method that raises `NotImplementedError`. Then create two subclasses, `AWSProvider` and `GCPProvider`, that override this method to return `"AWS node"` and `"GCP node"` respectively.',starter:`class CloudProvider:
    def provision_node(self) -> str:
        # Raise NotImplementedError
        pass

# Create AWSProvider subclass
# Create GCPProvider subclass

def scale_out(provider: CloudProvider):
    # Call provision_node on the provider and return the string
    return provider.provision_node()`,expected:"'AWS node' and 'GCP node'",tests:`
aws = AWSProvider()
gcp = GCPProvider()

assert scale_out(aws) == "AWS node", f"Expected 'AWS node', got {scale_out(aws)}"
assert scale_out(gcp) == "GCP node", f"Expected 'GCP node', got {scale_out(gcp)}"

base = CloudProvider()
try:
    base.provision_node()
    assert False, "CloudProvider.provision_node() should raise NotImplementedError"
except NotImplementedError:
    pass

print('PASS')`,hint:'Inherit using `class AWSProvider(CloudProvider):`. Inside the class, define `def provision_node(self): return "AWS node"`. Do the same for GCP.',solution:`class CloudProvider:
    def provision_node(self):
        raise NotImplementedError("Subclasses must implement this!")

class AWSProvider(CloudProvider):
    def provision_node(self):
        return "AWS node"

class GCPProvider(CloudProvider):
    def provision_node(self):
        return "GCP node"

def scale_out(provider):
    return provider.provision_node()`,explanation:'Polymorphism means treating different object types through the exact same interface. The `scale_out` orchestration function does not need a mess of `if provider == "AWS": ... elif provider == "GCP":`. It simply calls `.provision_node()` and relies on the specific subclass implementation.'},
  {id:'decorator-timer',title:'51 · Write an Execution Timer Decorator',prompt:'Write a decorator `@time_execution` that wraps a function, captures `time.time()` before and after the function executes, prints the duration, and returns the original function\\'s result.',starter:`import time

def time_execution(func):
    def wrapper(*args, **kwargs):
        # 1. Record start time
        # 2. Execute the wrapped function: result = func(*args, **kwargs)
        # 3. Record end time and print duration
        # 4. Return result
        pass
    return wrapper

@time_execution
def simulate_work():
    time.sleep(0.1)
    return "done"`,expected:"Prints duration and returns 'done'",tests:`
import io
import sys

# Capture stdout
captured = io.StringIO()
sys.stdout = captured

res = simulate_work()

sys.stdout = sys.__stdout__
output = captured.getvalue()

assert res == "done", f"Expected 'done', got {res}"
assert "0." in output, "Decorator did not print a duration string."
print('PASS')`,hint:'Inside `wrapper`, do `start = time.time()`. Then call the function and save it: `result = func(*args, **kwargs)`. Then `print(time.time() - start)`. Return `result`.',solution:`import time

def time_execution(func):
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        duration = time.time() - start
        print(f"Executed in {duration:.4f} seconds")
        return result
    return wrapper`,explanation:'Decorators are heavily used in AI Infrastructure to abstract away repetitive tasks like Prometheus metrics instrumentation, logging, authentication, and connection retries without cluttering the core business logic of the function.'},
  {id:'dataclasses',title:'52 · Dataclasses and Default Mutability',prompt:'Create a `dataclass` called `JobConfig` with a `job_name` string, an `image` string, and a list of strings called `flags`. You MUST ensure that the `flags` list does not share memory across instances (use `field(default_factory=list)`).',starter:`from dataclasses import dataclass, field
from typing import List

# Use the @dataclass decorator
class JobConfig:
    pass

job1 = JobConfig(job_name="train", image="cuda:12")
job2 = JobConfig(job_name="infer", image="cuda:12")
job1.flags.append("--verbose")`,expected:"job2.flags remains empty",tests:`
job1 = JobConfig(job_name="a", image="b")
job2 = JobConfig(job_name="c", image="d")

job1.flags.append("test")
assert "test" not in job2.flags, "CRITICAL: job1 and job2 are sharing the same 'flags' list in memory!"
assert job1.job_name == "a"
print('PASS')`,hint:'Use `@dataclass`. Add fields: `job_name: str`, `image: str`, and `flags: List[str] = field(default_factory=list)`.',solution:`from dataclasses import dataclass, field
from typing import List

@dataclass
class JobConfig:
    job_name: str
    image: str
    flags: List[str] = field(default_factory=list)`,explanation:'If you set `flags: list = []` as a class variable, Python evaluates `[]` exactly once when the file is loaded. Every instance of `JobConfig` will share the exact same list in RAM, leading to horrific, hard-to-debug cross-contamination bugs in production. `default_factory=list` creates a fresh list every time a class is instantiated.'},
"""

    target = "];\n\nconst labGroups:"
    if target not in content:
        print("Could not find target to insert labs")
        sys.exit(1)
        
    content = content.replace(target, new_labs + target)
    
    tier_5 = "{name: 'Tier 5 — Advanced Microservices & Async Ops (Senior)', ids: ['async-retry', 'json-validation', 'async-gather', 'file-batching']},"
    tier_6 = "\n  {name: 'Tier 6 — Advanced OOP, Classes & Decorators', ids: ['oop-polymorphism', 'decorator-timer', 'dataclasses']},"
    
    content = content.replace(tier_5, tier_5 + tier_6)
    
    # Also update the text saying "five tiers" to "six tiers"
    content = content.replace("arranged in five tiers", "arranged in six tiers")
    
    with open('src/pages/labs.tsx', 'w') as f:
        f.write(content)
        
modify_labs()
