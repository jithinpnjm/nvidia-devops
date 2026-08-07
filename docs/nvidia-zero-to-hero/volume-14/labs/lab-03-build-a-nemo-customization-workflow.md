---
title: Lab 03 — Build a NeMo Customization Workflow
description: Plan and execute a small model-customization workflow with lineage, checkpointing, evaluation, and packaging.
sidebar_position: 22
tags: [lab, nemo, customization]
---

# Lab 03 — Build a NeMo Customization Workflow

## Objective

Run a small domain-specific fine-tuning job and preserve complete lineage so the resulting model can be reproduced or audited later.

## Step 1: Record Base Model and License

```bash
# Download base model and record its exact revision
git clone https://huggingface.co/meta-llama/Llama-2-7b-hf model_source
cd model_source
BASE_MODEL_COMMIT=$(git rev-parse HEAD)
cd ..

# Create metadata file
cat > training_metadata.yaml <<EOF
training_job:
  id: "fine-tune-llama2-domain-20260807"
  objective: "Fine-tune Llama2-7B on domain-specific data"

base_model:
  name: "Llama2-7b-hf"
  source: "https://huggingface.co/meta-llama/Llama-2-7b-hf"
  commit: "$BASE_MODEL_COMMIT"  # Immutable reference
  license: "Community License (non-commercial use only)"
  approval: "Approved for internal fine-tuning on 2026-08-01"
EOF
```

## Step 2: Prepare and Version Dataset

```bash
# Create small domain-specific dataset
mkdir -p data
cat > data/domain_corpus.jsonl <<EOF
{"text": "AI infrastructure consists of compute, memory, networking, and storage layers."}
{"text": "GPU memory hierarchy includes registers, shared memory, L2 cache, and HBM."}
{"text": "CUDA kernels execute in parallel across thousands of cores."}
... (500 more examples)
EOF

# Compute immutable hash of dataset
DATASET_HASH=$(sha256sum data/domain_corpus.jsonl | cut -d' ' -f1)

# Record dataset metadata
cat >> training_metadata.yaml <<EOF

dataset:
  name: "domain_corpus_v1"
  path: "s3://our-bucket/datasets/domain_corpus.jsonl"
  size_bytes: 2500000
  sha256: "$DATASET_HASH"
  preprocessing: "Tokenized with Llama2 vocab, max_length=2048"
  train_val_split: "90/10"
EOF

# Version control dataset hash
echo "$DATASET_HASH  domain_corpus.jsonl" > data/CHECKSUMS
git add data/CHECKSUMS
git commit -m "Dataset: domain_corpus_v1 for fine-tuning"
```

## Step 3: Prepare Training Configuration

```bash
# Create versioned training config
cat > training_config.yaml <<EOF
# Training configuration for reproducibility
model_name_or_path: "./model_source"
output_dir: "./checkpoints"
overwrite_output_dir: false

# Training parameters
num_train_epochs: 1
max_steps: 5000  # Small for this lab
save_steps: 1000
eval_steps: 1000
learning_rate: 5e-5
per_device_train_batch_size: 8
per_device_eval_batch_size: 8
gradient_accumulation_steps: 4
warmup_steps: 500
weight_decay: 0.01

# Precision
tf32: true
fp16: false
bf16: true  # Use bfloat16 for better stability

# Hardware
ddp_find_unused_parameters: false
dataloader_pin_memory: true

# Logging and checkpointing
logging_steps: 100
logging_dir: "./logs"
save_total_limit: 3  # Keep last 3 checkpoints only
EOF

# Record config in metadata
git add training_config.yaml
git commit -m "Training config: domain-specific fine-tune parameters"

# Include in metadata
CONFIG_COMMIT=$(git rev-parse HEAD)
cat >> training_metadata.yaml <<EOF

training_config:
  file: "training_config.yaml"
  commit: "$CONFIG_COMMIT"
  framework: "HuggingFace Transformers with PyTorch"
  framework_version: "4.35.0"
  nemo_framework_version: "2.0.0"
  container_image: "nvcr.io/nvidia/nemo:24.07"
  container_digest: "sha256:xyz..."
EOF
```

## Step 4: Run Training Job in Kubernetes

```bash
# Create training job YAML
cat > training-job.yaml <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: fine-tune-llama2-domain-20260807
spec:
  template:
    spec:
      containers:
      - name: trainer
        image: nvcr.io/nvidia/nemo:24.07
        imagePullPolicy: Always
        env:
        - name: CUDA_VISIBLE_DEVICES
          value: "0,1,2,3"  # 4 GPUs
        volumeMounts:
        - name: data
          mountPath: /data
        - name: checkpoints
          mountPath: /checkpoints
        command:
        - bash
        - -c
        - |
          cd /workspace
          python -m torch.distributed.launch \
            --nproc_per_node 4 \
            fine_tune_llama2.py \
            --training_config training_config.yaml
        resources:
          requests:
            nvidia.com/gpu: 4
            memory: "120Gi"
          limits:
            nvidia.com/gpu: 4
            memory: "150Gi"
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: training-data-pvc
      - name: checkpoints
        persistentVolumeClaim:
          claimName: training-checkpoints-pvc
      restartPolicy: OnFailure
EOF

# Submit the job
kubectl apply -f training-job.yaml

# Monitor training
kubectl logs -f job/fine-tune-llama2-domain-20260807

# Example output:
# [2026-08-07 14:23:00] Starting training...
# [2026-08-07 14:24:00] Step 100, loss: 2.45, lr: 5e-05
# [2026-08-07 14:25:00] Step 200, loss: 2.38, lr: 5e-05
# [2026-08-07 15:00:00] Checkpoint saved: step-1000
```

## Step 5: Save Checkpoint and Record Metadata

```bash
# After training completes, list checkpoints
ls -la checkpoints/
# checkpoint-1000/
# checkpoint-2000/
# checkpoint-3000/
# checkpoint-5000/ ← final

# Record checkpoint details
CHECKPOINT_PATH="checkpoints/checkpoint-5000"
CHECKPOINT_SIZE=$(du -sh $CHECKPOINT_PATH | cut -f1)
CHECKPOINT_HASH=$(find $CHECKPOINT_PATH -type f -exec sha256sum {} + | sha256sum | cut -d' ' -f1)

cat >> training_metadata.yaml <<EOF

checkpoint:
  path: "$CHECKPOINT_PATH"
  size: "$CHECKPOINT_SIZE"
  sha256: "$CHECKPOINT_HASH"
  step: 5000
  training_samples_processed: 500000  # 100 examples * 5000 steps
  save_time: "2026-08-07T16:30:00Z"
  
training_metrics:
  final_loss: 1.87
  eval_loss: 1.92
  baseline_loss: 2.15  # Loss on base model
  loss_improvement: "12.8%"
EOF

# Push checkpoint to S3
aws s3 cp --recursive $CHECKPOINT_PATH \
  s3://our-bucket/checkpoints/fine-tune-llama2-domain-20260807/
```

## Step 6: Evaluate Against Baseline

```bash
# Load checkpoint and run evaluation
python evaluate.py \
  --model $CHECKPOINT_PATH \
  --test_set data/domain_corpus_test.jsonl \
  --metrics perplexity,rouge,bleu

# Example output:
# Perplexity on test set: 15.2
# ROUGE-1: 0.35
# BLEU: 0.28

# Compare to baseline
python evaluate.py \
  --model ./model_source \
  --test_set data/domain_corpus_test.jsonl \
  --metrics perplexity,rouge,bleu

# Example output:
# Perplexity on test set: 18.7  ← worse (higher) than fine-tuned
# ROUGE-1: 0.31
# BLEU: 0.24

# Record results
cat >> training_metadata.yaml <<EOF

evaluation:
  test_set: "domain_corpus_test.jsonl (5000 examples)"
  
  fine_tuned_model:
    perplexity: 15.2
    rouge1: 0.35
    bleu: 0.28
  
  baseline_model:
    perplexity: 18.7
    rouge1: 0.31
    bleu: 0.24
  
  improvement:
    perplexity_reduction: "18.7% better"
    rouge1_gain: "12.9%"
    bleu_gain: "16.7%"
  
  evaluation_result: "PASSED - All metrics improved"
EOF
```

## Step 7: Package for Serving

```bash
# Convert checkpoint to NIM-deployable format (quantized, optimized)
python convert_to_nim.py \
  --checkpoint $CHECKPOINT_PATH \
  --output_format "NIM-optimized" \
  --quantization "bfloat16"  # Keep precision, no aggressive quantization

# Result: model.safetensors, config.json, tokenizer.json
NIM_MODEL_SIZE=$(du -sh model.safetensors | cut -f1)

# Push to NGC or internal model registry
aws s3 cp model.safetensors \
  s3://our-bucket/models/fine-tune-llama2-domain/model-20260807.safetensors

# Create model card with all lineage
cat > model_card.md <<EOF
# Fine-Tuned Llama2-7B for Domain-Specific Tasks

## Training Details
- **Base Model**: Llama2-7b-hf (commit $BASE_MODEL_COMMIT)
- **Training Date**: 2026-08-07
- **Training Steps**: 5000
- **Batch Size**: 8 per GPU (32 total, 4 GPUs)
- **Learning Rate**: 5e-5
- **Framework**: HuggingFace Transformers + NeMo

## Dataset
- **Name**: domain_corpus_v1
- **Size**: 2.5MB (500 examples for lab, 500K for production)
- **Hash**: $DATASET_HASH
- **Preprocessing**: Tokenized, max_length=2048

## Evaluation Results
- **Test Perplexity**: 15.2 (baseline: 18.7)
- **ROUGE-1**: 0.35 (baseline: 0.31)
- **BLEU**: 0.28 (baseline: 0.24)

## License
- **Base Model License**: Community License (non-commercial)
- **Fine-tuning Use**: Internal, non-commercial only
- **Approved By**: ML Ops on 2026-08-01

## Reproducibility
All inputs (base model, dataset, configuration) are versioned and can be found in Git commit $CONFIG_COMMIT.
To reproduce: `nemo-reproduce training_metadata.yaml`
EOF

cat >> training_metadata.yaml <<EOF

model_packaging:
  nim_format_size: "$NIM_MODEL_SIZE"
  s3_path: "s3://our-bucket/models/fine-tune-llama2-domain/model-20260807.safetensors"
  model_card: "model_card.md"
  deployment_ready: true
EOF
```

## Step 8: Failure Injection — Checkpoint Recovery

```bash
# Simulate job interruption after checkpoint-3000
# Kill the training job mid-way
kubectl delete job/fine-tune-llama2-domain-20260807

# Verify latest checkpoint is preserved
ls checkpoints/checkpoint-3000/
# config.json, pytorch_model.bin, etc. still exist

# Resume training from checkpoint
python resume_training.py \
  --resume_from_checkpoint checkpoints/checkpoint-3000 \
  --num_train_epochs 1 \
  --start_step 3000  # Continue from step 3000, not step 0

# Expected: Training resumes without re-processing first 300K samples
# Loss at step 3001 should be close to loss at step 3000 (continuity)

# Test incompatible checkpoint (simulate data corruption)
# Create a fake checkpoint and try to load it
mkdir checkpoints/checkpoint-corrupted
echo "fake data" > checkpoints/checkpoint-corrupted/pytorch_model.bin

# Attempt to resume
python resume_training.py \
  --resume_from_checkpoint checkpoints/checkpoint-corrupted
# Expected: Clear error message: "Checkpoint corrupted or incompatible"
# (Should not silently fail or start training from zero)
```

## Final Evidence Collection

```bash
# Create immutable evidence archive
git add training_metadata.yaml model_card.md
git commit -m "Training complete: fine-tune-llama2-domain-20260807 APPROVED"

# Tag the commit
git tag -a training/fine-tune-llama2-domain-20260807-v1.0 \
  -m "Fine-tuned model ready for deployment"

# Push to Git (immutable history)
git push origin training/fine-tune-llama2-domain-20260807-v1.0

# Archive logs and metrics
tar czf training-evidence-20260807.tar.gz \
  logs/ \
  checkpoints/checkpoint-5000/ \
  training_metadata.yaml \
  model_card.md

# Store in S3 with immutable versioning
aws s3 cp training-evidence-20260807.tar.gz \
  s3://our-bucket/training-archives/

echo "Training job evidence archived and immutable"
```

## Validation Checklist

Before marking "training complete":

- [ ] Base model version recorded (commit hash)
- [ ] Dataset version recorded (SHA256 hash)
- [ ] Training configuration version controlled
- [ ] Checkpoint saved and checksummed
- [ ] Evaluation passed (metrics improved vs baseline)
- [ ] Model card created (lineage, license, results)
- [ ] Failure injection tested (checkpoint recovery works)
- [ ] Rollback tested (can resume from previous checkpoint)
- [ ] Model packaged for serving (NIM format)
- [ ] All evidence in Git or S3 with immutable versions
