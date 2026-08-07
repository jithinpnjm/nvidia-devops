# Chapter 1: Consulting Methodology for Customer Engagement

| Chapter metadata | Value |
|---|---|
| Volume | 22 — Customer Workshops |
| Difficulty | Foundation |
| Estimated reading time | 40 minutes |
| Primary audience | Sales Engineers, Solutions Architects, Customer Success Engineers |
| Core question | How do you translate customer business requirements into infrastructure design and cost proposals? |

## Learning Outcome

By the end of this chapter, you will be able to:
- Conduct a structured customer discovery interview
- Extract quantifiable infrastructure requirements from vague business goals
- Map requirements to NVIDIA GPU architectures and deployment patterns
- Build a justifiable cost model for the customer's use case
- Define success metrics and validation gates

## The Consulting Challenge

Customers rarely speak in infrastructure terms. They say things like:

- "We need to **cut fraud detection latency in half**" (from an analytics perspective)
- "We want to **train models 10× faster**" (from a competitive timeline perspective)
- "We need to **run this in a regulated data center**" (from a compliance perspective)

Your job: translate these into specific GPU resource requirements, architecture decisions, and cost trade-offs. A consultant who can't do this leaves money on the table—or, worse, over-provisions infrastructure and wastes the customer's budget.

## The Discovery Framework: Four Questions

Structure every customer engagement around these four questions. Ask them in order; answers to earlier questions constrain later ones.

### 1. **What Is the Business Constraint?**

**Why ask it:** Customers often start with a solution ("we want to use AI") when they really have a constraint ("we have 2 seconds to score a loan application"). Understanding the constraint first ensures you're solving the real problem, not the one they've invented.

**Real customer examples:**

| Customer | What they said | Actual constraint |
|---|---|---|
| Hedge fund | "We need LLM trading signals" | Inference latency < 50ms per signal; must score 100K events/hour |
| Bank | "We want to modernize fraud detection" | Current system: 30-minute batch, misses 2% of fraud. Need real-time scoring at <100ms. Handle 50K transactions/second. |
| Telecom | "We're building AI-driven network optimization" | Cell tower congestion prediction must update every 5 minutes; cover 10,000 sites; run 24/7 with <30ms decision latency. |
| Pharma | "We need to accelerate drug discovery" | Current: 6 months to screen 10M molecular candidates. Need: 2 weeks. Budget: $500K hardware. |

**How to ask it:**

1. **Start with impact, not technology:** "What business outcome would make this project a success? What would change in your operations?"
2. **Force quantification:** "How many transactions per second? How many currently fail that shouldn't? How many false positives are acceptable?"
3. **Pin down the hard deadline:** "When does this need to be live? Is that a hard business deadline or flexible?"
4. **Identify the cost ceiling:** "What budget have you allocated for infrastructure? Is this fixed, or can it grow if ROI is clear?"

**Real discovery output (annotated):**

```
Customer: "We need to detect fraud faster."

You: "What does 'faster' mean? What's the current latency, and what's the target?"

Customer: "Right now we detect fraud a day or two after the transaction. Ideally, we'd catch it immediately."

You: "So real-time scoring at point of transaction. What volume are we talking about?"

Customer: "About 200 million transactions per day globally. Peak is about 5,000 transactions per second."

You: "OK, 5,000 TPS is your peak throughput target. What latency does the business require? Can you score in 100ms, or does it need to be under 50ms?"

Customer: "Under 100ms is fine. We can queue briefly if needed. But we can't have it down for maintenance during business hours."

You: "High availability—OK. And the model you're using now?"

Customer: "XGBoost, about 2GB. Runs on CPUs today."

→ EXTRACTED REQUIREMENTS:
- Throughput: 5,000 TPS sustained (200M/day)
- Latency: < 100ms p99
- HA: 99.9% uptime, no planned downtime during 6-18 UTC
- Model: XGBoost, ~2GB
```

### 2. **What Is the Technical Constraint?**

**Why ask it:** A business constraint (5,000 TPS) can be satisfied by multiple architectures. The technical constraint—the thing that rules out naive solutions—determines which GPU architecture you need.

### 3. **What Is the Deployment Constraint?**

**Why ask it:** Infrastructure works differently in production than in benchmarks. Deployment constraints shape the entire architecture.

### 4. **What Is the Success Metric?**

**Why ask it:** Without this, there's no way to know if your design worked.

## Success Metrics Table

| Metric | Industry | Example target |
|---|---|---|
| **Inference latency (p99)** | Financial services | < 50ms |
| **Throughput sustained** | Telecom | 50,000 events/sec |
| **Cost per inference** | LLM serving | < $0.0001 per token |
| **Training time** | Pharma | Reduce from 6 weeks to 2 weeks |
| **Model accuracy** | Healthcare | Maintain > 94% precision |
| **Uptime SLA** | Mission-critical | 99.99% (< 52 minutes downtime/year) |

## Cost Model: From Infrastructure to Customer Quote

Once you know the architecture, build a cost model.

### Typical Cost Components

**Hardware (fixed, one-time):**
- GPU costs (H100 = $30-40K, L40S = $10-15K, L4 = $2.5K)
- CPU and memory
- Storage (NVMe for checkpoints)

**Operations (annual recurring):**
- Power (H100 draws 500W, costs ~$660/year per GPU at $0.15/kWh, running continuously)
- Cooling (typically 30-50% of power cost in data centers)
- Staff (1 engineer maintains ~20-30 GPUs)

### Real Cost Example: Bank Fraud Detection

**Requirements:**
- 5,000 TPS sustained
- < 100ms p99 latency
- 99.9% uptime
- On-premises deployment
- 2-year commitment

**Architecture chosen:**
- 2 inference clusters (HA)
- 4 L40S GPUs per cluster = 8 GPUs total (cost-optimized for inference)
- Total inferences per year: 5,000 TPS × 86,400 sec/day × 365 days = 157.7 billion

**Cost breakdown:**

| Category | Count | Unit cost | Total | Notes |
|---|---|---|---|---|
| **Hardware** | | | | |
| L40S GPUs | 8 | $12,000 | $96,000 | 2-year amortization |
| Server hardware (CPU, RAM, NVMe) | 2 | $25,000 | $50,000 | Dual-socket, 512GB RAM |
| InfiniBand (optional HA sync) | 1 | $15,000 | $15,000 | Reduces replication latency |
| **Subtotal Hardware** | | | $161,000 | |
| | | | | |
| **Operations (annual)** | | | | |
| Power (8 GPUs × 250W × 8,760 × $0.15/kWh) | | | $2,628 | Assumes 50% utilization avg |
| Cooling, facilities (30% of power) | | | $788 | |
| Network bandwidth | | | $2,000 | |
| Staff (0.5 engineer at $150K/year) | | | $75,000 | Shared across projects |
| **Subtotal Ops (Annual)** | | | $80,416 | |
| | | | | |
| **Cost per inference** | 157.7B | | $80,416 ÷ 157.7B | **$0.00000051** |

**What to present to the customer:**

"To handle 5,000 TPS with < 100ms latency and 99.9% uptime, we recommend a dual-cluster setup with 4 L40S GPUs per cluster. Hardware investment is $161,000 upfront. Annual operations cost is $80,416. This breaks down to about $220/day for 157.7 billion inferences/year, or $0.51 per million inferences. This is 4-6× cheaper than cloud inference (AWS SageMaker, Azure ML) at $2-3 per million inferences."

## Interview Preparation

**Conceptual:** "Walk me through how you'd approach a new customer who says 'we want to use AI but we're not sure where to start.'"

**Model Answer:** "I'd follow the four constraints framework. First, I'd ask: what's the business outcome and what's the current bottleneck? Second, I'd get the technical details. Third, I'd ask about deployment. Fourth, I'd establish success metrics. Only then would I propose an architecture."

## Related Chapters

- **Next:** [Chapter 2 — Banking and Financial Services](./chapter-02-banking-and-financial-services.md)
- **Lab:** [Lab 01 — Banking Use Case Workshop](./labs/lab-01-banking-use-case-workshop.md)
