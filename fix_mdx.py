import os

f1 = 'docs/nvidia-zero-to-hero/volume-01/labs/lab-02-trace-an-ai-request-path.md'
with open(f1, 'r') as f:
    c1 = f.read()
    
# Find the unclosed code block at the problematic lines
c1 = c1.replace(
    'The important measurement is stage contribution, not the absolute benchmark. Calculate the approximate percentage of time spent in each stage:\n\nrecords = [',
    'The important measurement is stage contribution, not the absolute benchmark. Calculate the approximate percentage of time spent in each stage:\n\n```python\nrecords = ['
)
c1 = c1.replace(
    'for field in ("preprocessing_ms", "execution_ms"):\n    print(f"{field}: {(float(last[field]) / total) * 100:.1f}%")\n\nThe output shows where tuning effort belongs. If execution is only 20%',
    'for field in ("preprocessing_ms", "execution_ms"):\n    print(f"{field}: {(float(last[field]) / total) * 100:.1f}%")\n```\n\nThe output shows where tuning effort belongs. If execution is only 20%'
)

with open(f1, 'w') as f:
    f.write(c1)

f2 = 'docs/nvidia-zero-to-hero/volume-19/chapter-11-placeholder.md'
with open(f2, 'r') as f:
    c2 = f.read()

c2 = c2.replace(
    '### Initial state: data-loading bound\n\nLayer               Avg (ms)   % of step',
    '### Initial state: data-loading bound\n\n```text\nLayer               Avg (ms)   % of step'
)

with open(f2, 'w') as f:
    f.write(c2)

