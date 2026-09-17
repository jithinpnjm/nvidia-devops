import os

filepath = "/Users/jithinpjoseph/Documents/GitHub/nvidia-devops/docs/volume-10/11-cicd-for-infrastructure-and-cluster-configuration.md"

content = """
---

## 19. Advanced Drift Detection and Self-Healing Automation

Infrastructure drift occurs when the live state of a system diverges from its codified definition in version control. While GitOps natively handles drift for Kubernetes, Terraform and Ansible require specialized CI/CD patterns to detect and mitigate drift safely.

### 19.1 Automated Drift Detection Pipelines

An enterprise AI factory should run a continuous drift detection pipeline (e.g., every 4 hours). This pipeline does NOT apply changes; it only alerts operators when discrepancies are found.

```yaml
# .github/workflows/drift-detection.yml
name: "Continuous Drift Detection"

on:
  schedule:
    - cron: '0 */4 * * *' # Every 4 hours

jobs:
  detect_drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
      
      - name: Configure Cloud Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::1234567890:role/DriftDetector
          aws-region: us-east-1
          
      - name: Terraform Init
        run: terraform init
        
      - name: Terraform Plan (Detailed Exitcode)
        id: drift_plan
        # -detailed-exitcode returns 0 (no diff), 1 (error), or 2 (diff exists)
        continue-on-error: true
        run: terraform plan -detailed-exitcode -refresh-only
        
      - name: Alert on Drift
        if: steps.drift_plan.outputs.exitcode == '2'
        uses: slackapi/slack-github-action@v1.24.0
        with:
          payload: |
            {
              "text": "🚨 *INFRASTRUCTURE DRIFT DETECTED* 🚨\nThe production Terraform state no longer matches the live cloud environment. Please investigate immediately to prevent subsequent apply failures."
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### 19.2 The "Reconciliation vs. Backport" Decision Matrix

When drift is detected, the SRE team must choose between two paths:

| Scenario | Recommended Action | Explanation |
|---|---|---|
| **Malicious or Accidental Modification** (e.g., a junior dev opened SSH to the world) | **Auto-heal / Revert** | Run `terraform apply` to overwrite the manual change and restore the Git-defined secure state. |
| **Emergency Incident Response** (e.g., increased an EBS volume size at 3 AM to prevent an outage) | **Backport to Git** | Modifying the Terraform code to match reality, then running `terraform apply -refresh-only` to update state. Reverting this would cause a recurrence of the outage. |

---

## 20. Conclusion: The Pipeline as a Product

In an AI factory, the CI/CD pipeline is not just a delivery mechanism—it is a **first-class product**. It requires the same level of architectural rigor, monitoring, and engineering investment as the GPU clusters it manages. 

A mature infrastructure pipeline transforms the historically terrifying act of updating core cluster components into a mundane, auditable, and easily executable event. By implementing stringent Policy-as-Code checks, separating integration from delivery, and adopting immutable golden images, platform teams can operate massive-scale infrastructure at peak velocity without sacrificing stability.

### The Architect's Checklist

Before authorizing the deployment of a new infrastructure CI/CD pipeline, a Senior Solutions Architect must verify:
- [ ] **State Backend Security:** Are the Terraform/Ansible state backends isolated, versioned, and restricted via IAM?
- [ ] **OIDC Integration:** Are we using identity federation instead of static, long-lived credentials?
- [ ] **Blast Radius Policies:** Is OPA/Sentinel blocking catastrophic actions (e.g., destroying placement groups or databases)?
- [ ] **Plan Artifact Passing:** Is the exact binary output of the CI plan stage being downloaded and executed by the CD apply stage?
- [ ] **Canary Gates:** Are physical hardware updates gated by a canary node subset and automated telemetry validation?
- [ ] **Break-Glass Procedures:** Is there a documented, auditable process for bypassing the pipeline during a total catastrophic outage?
"""

with open(filepath, "a") as f:
    f.write(content)

print("Successfully appended final content.")
