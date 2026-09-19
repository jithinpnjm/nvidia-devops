import os
import glob

for vol in range(20, 25):
    folder = f'docs/nvidia-zero-to-hero/volume-{vol:02d}'
    placeholders = glob.glob(f'{folder}/*placeholder*.md')
    if placeholders:
        for p in placeholders:
            print(f"Removing {p}")
            os.remove(p)
