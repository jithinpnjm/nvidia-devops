---
title: "6 - AI and machine learning fundamentals: what you need before Volume 5"
slug: "6-ai-and-machine-learning-fundamentals-before-volume-5"
sidebar_position: 6
description: "AI and machine learning fundamentals: what you need before Volume 5 — Foundations Primer."
source_document: "Authored directly for the Foundations Primer — no DOCX source."
---

## What this chapter is, and what it isn't

This chapter will not make you a machine learning engineer, and it won't teach you the math behind neural network training in any rigorous sense — Volume 5 (AI Workloads and AI Platform Architecture) assumes you already have a working vocabulary for "training," "inference," "parameters," and "tokens," and moves straight into infrastructure decisions built on top of that vocabulary. What this chapter gives you is exactly that vocabulary, demystified rather than hand-waved, so that when Volume 5 says "training and inference have very different infrastructure needs," you already know precisely what those two words mean and why that sentence is true.

You're a senior engineer. You've almost certainly heard "model," "training," "inference," "parameters," and "LLM" tossed around casually. This chapter's job is to make sure those words mean something precise and unmysterious to you, one at a time.

## What a machine learning model actually is: honest version, no mysticism

Strip away the framing you may have absorbed from marketing or media: a **machine learning model** (a mathematical function with a large number of adjustable internal numbers that produces an output from an input) is, at the most honest level, a big function. You give it an input, it does arithmetic, it gives you an output. What makes it "learn" anything is that this function has an enormous number of internal numbers that can be adjusted — and adjusting them changes what the function computes.

Those adjustable internal numbers are called **parameters**, also commonly called **weights** (the adjustable numbers inside a model that determine what it computes; changing them changes the model's behavior). Think of them the same way you'd think of tunable coefficients in a big formula you already understand — like coefficients in a linear regression, just vastly more of them, arranged in layers instead of one flat equation. Nothing about a weight, by itself, is mysterious: it's a number, multiplied against some input, contributing to a result. The "intelligence," such as it is, comes entirely from having found — through a process described next — a specific combination of billions of these numbers that happens to produce useful outputs.

This is deliberately deflationary, and that's the point: a model is curve-fitting at enormous scale, not something categorically different from statistics you already understand the shape of.

**Check your understanding**
- Q: What is a "parameter" or "weight," concretely? A: One of the adjustable internal numbers in a model's function; changing it changes what the function outputs, the same way changing a coefficient changes a formula's result.
- Q: Is a model doing something fundamentally different from curve-fitting? A: No — at the honest, mechanical level, it's curve-fitting at a much larger scale, with many more adjustable numbers than a simple regression.

## What "training" actually means

So how do you find a good combination of billions of numbers? You don't set them by hand — you can't. **Training** (the process of repeatedly showing a model examples, measuring how wrong its output was, and adjusting its weights slightly to be less wrong next time) is that search process, done automatically and repeatedly.

The loop, in plain terms: show the model an example input where you know the correct output. Let the model compute its current output. Compare that output to the correct one and quantify how wrong it was. Nudge every weight a small amount in whatever direction tends to reduce that wrongness. Repeat — typically billions of times, across a huge dataset of examples.

This is precisely why training needs so much computation, and precisely why GPUs matter specifically for this step: each "nudge all the weights a little based on this batch of examples" step is, mechanically, applying the same kind of arithmetic operation across an enormous number of independent numbers at once — the exact same shape of problem the previous chapter described a GPU as being built for (recall the spreadsheet analogy: the same formula applied to millions of cells simultaneously). Training a large model is that operation, repeated at massive scale, which is why it's so GPU-hungry.

**Check your understanding**
- Q: In one sentence, what does "training" mean? A: Repeatedly showing a model examples, scoring how wrong its output was, and adjusting its weights to reduce that wrongness.
- Q: Why does training specifically need GPUs rather than just "a lot of computers"? A: Because adjusting millions or billions of weights based on a batch of examples is the same massively-parallel, same-operation-on-lots-of-data shape of math that GPUs are purpose-built to accelerate.

## What "inference" actually means, and why the training/inference split is the most important idea here

**Inference** (using an already-trained model, with its weights frozen and unchanging, to produce an output for a new input) is what happens after training is done. The weights are no longer being adjusted — you're just running the function forward, once, on a new input, to get an answer.

This distinction — training adjusts weights, inference does not — is the single most load-bearing idea for reading Volume 5. Training and inference have almost entirely different infrastructure profiles: training is a long-running, extremely GPU- and memory-intensive batch process you run occasionally (to produce or update a model); inference is what happens continuously, in production, every time a user asks the deployed model something, and it typically needs to be fast and cheap per-request rather than maximally powerful per-run. Volume 5 spends real time on exactly this split because "which infrastructure do I need" has a completely different answer depending on which of the two you're doing. If you remember nothing else from this chapter, remember: training changes the model; inference uses the model.

**Check your understanding**
- Q: What's the one-sentence difference between training and inference? A: Training adjusts a model's weights based on examples; inference uses an already-trained, frozen model to produce an output for a new input, without changing anything.
- Q: Why might a production system need very different infrastructure for inference than for training? A: Training is an occasional, long-running, maximally GPU-intensive batch job to produce a model; inference is a continuous, per-request workload that usually needs to be fast and cost-efficient rather than maximally powerful.

## What a "token" is, and why generating one at a time matters

A **token** (a chunk of text — roughly a word or word-piece — that a language model reads and generates one unit at a time) is the basic unit a language model actually operates on. Text gets broken into tokens before the model ever sees it, and a language model's output is produced one token at a time, not as a complete answer in one step: it generates a token, feeds that back in as part of its own input, generates the next token, and so on.

This one-token-at-a-time behavior is not an implementation detail you can ignore — it's the direct reason Volume 5 treats **prefill** and **decode** as two separate phases with different performance characteristics. Loosely: the model first processes your entire input at once (prefill), then generates the reply token by token, each new token depending on everything generated so far (decode). You don't need Volume 5's depth on this yet — you just need to already know that "a model produces text one token at a time" is *why* those two phases exist as a distinction at all, instead of encountering that split as an unexplained given.

**Check your understanding**
- Q: What is a token, in plain terms? A: A chunk of text, roughly a word or piece of a word, that a language model reads or generates as a single unit.
- Q: Why does a model generating one token at a time (rather than a full answer at once) lead to something like separate "prefill" and "decode" phases? A: Because processing the given input happens once up front, while generating the reply happens step by step, each new token depending on everything produced so far — two different kinds of work with different performance behavior.

## What "70 billion parameters" actually means, and why bigger models need more GPU memory

You've likely heard models described by size, like "a 70 billion parameter model." Given everything above, this is now simple to interpret honestly: it's a count — the model has roughly 70 billion of those adjustable weight numbers described earlier. Nothing more mysterious than that.

And once it's just a count of numbers, "bigger models need more GPU memory" stops being a mysterious fact and becomes an obvious consequence: every one of those numbers has to be stored somewhere to be used, and has to be involved in the arithmetic every time the model runs (whether training or doing inference). More numbers means more memory to hold them and more computation to process them — the relationship is direct and mechanical, not a special property of "AI." A 70-billion-parameter model needing far more GPU memory than a 1-billion-parameter model follows the same logic as a program needing more RAM to hold a bigger array.

**Check your understanding**
- Q: What does "70 billion parameters" literally refer to? A: A count of roughly 70 billion adjustable weight numbers inside the model.
- Q: Why does a bigger parameter count directly imply a need for more GPU memory? A: Because every parameter must be stored and used in computation each time the model runs — more numbers means more storage and more arithmetic, the same way a larger array needs more RAM.

## Glossary

- **Model** — a mathematical function with a large number of adjustable internal numbers that produces an output from an input.
- **Parameter / weight** — one of the adjustable internal numbers in a model that determines what it computes.
- **Training** — repeatedly showing a model examples, measuring how wrong its output was, and adjusting weights to reduce that wrongness.
- **Inference** — using an already-trained, frozen model to produce an output for a new input, without adjusting weights.
- **Token** — a chunk of text, roughly a word or word-piece, that a language model reads or generates as a single unit.
- **Prefill** — the phase where a model processes the entire given input at once, before generating any reply.
- **Decode** — the phase where a model generates the reply one token at a time, each depending on everything generated so far.
- **LLM (large language model)** — a language model with a very large number of parameters, typically trained on large amounts of text.

## You're ready for Volume 5 when you can...

- Explain what a model's "parameters" or "weights" literally are, without resorting to mystical language.
- State the training loop (show example, measure wrongness, nudge weights) in your own words.
- Explain the training-vs-inference distinction and why it drives fundamentally different infrastructure choices.
- Explain what a token is and why one-token-at-a-time generation is the reason prefill and decode exist as separate phases.
- Explain why a model with more parameters requires more GPU memory, using the "more numbers to store and compute" logic rather than an appeal to complexity.

**Continue to:** [Volume 5, Chapter 1 — Classify the AI workload before designing infrastructure](/curriculum/volume-05/chapter-1-classify-the-ai-workload-before-designing-infrastructure)
