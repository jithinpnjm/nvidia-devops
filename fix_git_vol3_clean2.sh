# Fix my sed mistake where I created "chapter-chapter-..." files.
git mv docs/nvidia-zero-to-hero/volume-03/chapter-chapter-01-why-cuda-exists.md docs/nvidia-zero-to-hero/volume-03/chapter-01-why-cuda-exists.md
git mv docs/nvidia-zero-to-hero/volume-03/chapter-chapter-02-cuda-software-stack.md docs/nvidia-zero-to-hero/volume-03/chapter-02-cuda-software-stack.md
git mv docs/nvidia-zero-to-hero/volume-03/chapter-chapter-03-cuda-programming-and-execution-model.md docs/nvidia-zero-to-hero/volume-03/chapter-03-cuda-programming-and-execution-model.md
git mv docs/nvidia-zero-to-hero/volume-03/chapter-chapter-04-kernel-launch-configuration-and-indexing.md docs/nvidia-zero-to-hero/volume-03/chapter-04-kernel-launch-configuration-and-indexing.md
git mv docs/nvidia-zero-to-hero/volume-03/chapter-chapter-05-cuda-memory-management-and-data-movement.md docs/nvidia-zero-to-hero/volume-03/chapter-05-cuda-memory-management-and-data-movement.md
git mv docs/nvidia-zero-to-hero/volume-03/chapter-chapter-06-synchronization-errors-and-correctness.md docs/nvidia-zero-to-hero/volume-03/chapter-06-synchronization-errors-and-correctness.md
git mv docs/nvidia-zero-to-hero/volume-03/chapter-chapter-07-streams-events-and-asynchronous-execution.md docs/nvidia-zero-to-hero/volume-03/chapter-07-streams-events-and-asynchronous-execution.md
git mv docs/nvidia-zero-to-hero/volume-03/chapter-chapter-08-pinned-memory-and-transfer-overlap.md docs/nvidia-zero-to-hero/volume-03/chapter-08-pinned-memory-and-transfer-overlap.md
# I missed ch9 earlier, need to fix that too.
cat rewrite_vol3_batch3.py | sed 's/09-unified-memory-and-demand-paging.md/chapter-09-unified-memory-and-demand-paging.md/g' > rewrite_ch9.py
python3 rewrite_ch9.py
git mv docs/nvidia-zero-to-hero/volume-03/chapter-chapter-10-cuda-graphs-and-repeated-execution.md docs/nvidia-zero-to-hero/volume-03/chapter-10-cuda-graphs-and-repeated-execution.md
git mv docs/nvidia-zero-to-hero/volume-03/chapter-chapter-11-compilation-binaries-and-compatibility.md docs/nvidia-zero-to-hero/volume-03/chapter-11-compilation-binaries-and-compatibility.md
git mv docs/nvidia-zero-to-hero/volume-03/chapter-chapter-12-profiling-and-production-troubleshooting.md docs/nvidia-zero-to-hero/volume-03/chapter-12-profiling-and-production-troubleshooting.md
git mv docs/nvidia-zero-to-hero/volume-03/chapter-chapter-13-volume-03-summary.md docs/nvidia-zero-to-hero/volume-03/chapter-13-volume-03-summary.md
git add docs/nvidia-zero-to-hero/volume-03/
git commit -m "fix(docs): correctly map Volume 3 filenames to avoid chapter-chapter duplication"
git push
