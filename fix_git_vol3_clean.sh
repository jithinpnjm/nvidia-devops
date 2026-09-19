rm docs/nvidia-zero-to-hero/volume-03/chapter-chapter-*
python3 rewrite_vol3_batch1.py
python3 rewrite_vol3_batch2.py
python3 rewrite_vol3_batch3.py
python3 rewrite_vol3_summary.py
git add docs/nvidia-zero-to-hero/volume-03/
git commit -m "feat(docs): drastically upgrade Volume 3 Chapters 1-13 to Senior Architect level while preserving exact file structure"
git push
