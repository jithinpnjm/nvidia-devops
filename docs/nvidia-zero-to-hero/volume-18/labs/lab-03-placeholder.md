---
title: "Lab 3 - Design and Verify Multi-Tenant RBAC"
slug: "lab-03-design-verify-rbac"
sidebar_position: 3
description: "Create RBAC policies for two teams sharing a cluster; verify least-privilege isolation; detect unauthorized access."
---

# Lab 3 — Design and Verify Multi-Tenant RBAC

**Objective:** Design RBAC policies for multi-tenant GPU cluster; verify isolation is enforced.

**Estimated time:** 60 minutes

**Prerequisites:**
- Kubernetes cluster with kubectl access
- Two namespaces: `team-a-ns` and `team-b-ns`

## Step 1: Create Namespaces

```bash
$ kubectl create namespace team-a-ns
$ kubectl create namespace team-b-ns
```

## Step 2: Create Service Accounts for Each Team

```bash
$ kubectl create serviceaccount team-a-user -n team-a-ns
$ kubectl create serviceaccount team-b-user -n team-b-ns
```

## Step 3: Create RBAC Roles (Minimal Privileges)

```yaml
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-manager
  namespace: team-a-ns
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["create", "get", "list", "watch"]
- apiGroups: [""]
  resources: ["secrets"]
  resourceNames: ["team-a-creds"]  # Only this secret
  verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: team-a-binding
  namespace: team-a-ns
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: pod-manager
subjects:
- kind: ServiceAccount
  name: team-a-user
```

(Repeat for team-b-ns with team-b-creds)

## Step 4: Create Secrets (One per Namespace)

```bash
$ kubectl create secret generic team-a-creds \
  --from-literal=username=team-a --from-literal=password=secret-a \
  -n team-a-ns

$ kubectl create secret generic team-b-creds \
  --from-literal=username=team-b --from-literal=password=secret-b \
  -n team-b-ns
```

## Step 5: Test Access (Should Succeed)

```bash
# Team A can read their own secret
$ kubectl get secret team-a-creds \
  --as=system:serviceaccount:team-a-ns:team-a-user \
  -n team-a-ns
NAME            TYPE      DATA   AGE
team-a-creds    Opaque    2      10s
```

## Step 6: Test Access Violation (Should Fail)

```bash
# Team A tries to read Team B's secret (should fail)
$ kubectl get secret team-b-creds \
  --as=system:serviceaccount:team-a-ns:team-a-user \
  -n team-b-ns
Error from server (Forbidden): secrets "team-b-creds" is forbidden
```

## Step 7: Test Cross-Namespace Access (Should Fail)

```bash
# Team A tries to list pods in Team B's namespace (should fail)
$ kubectl get pods \
  --as=system:serviceaccount:team-a-ns:team-a-user \
  -n team-b-ns
Error from server (Forbidden): pods is forbidden
```

## Step 8: Audit Verification

```bash
# Query audit logs for Forbidden events
$ grep "Forbidden" /var/log/kubernetes/audit.log | \
  jq '[.user.username, .verb, .objectRef.namespace]' | \
  grep team
```

Expected: Audit log shows multiple Forbidden events for cross-namespace access attempts.

## Deliverable

Document your RBAC design:

```
TEAM A NAMESPACE: team-a-ns
  Service Account: team-a-user
  Permissions:
    - Create pods in team-a-ns
    - Read team-a-creds secret
    - Cannot: read team-b-creds, access team-b-ns, delete pods

TEAM B NAMESPACE: team-b-ns
  Service Account: team-b-user
  Permissions:
    - Create pods in team-b-ns
    - Read team-b-creds secret
    - Cannot: read team-a-creds, access team-a-ns, delete pods

VERIFICATION RESULTS:
  - Same-namespace secret access: ALLOWED
  - Cross-namespace secret access: DENIED
  - Cross-namespace pod access: DENIED
  - Audit events logged for all denials: YES
```

## Next Steps

Deploy this design to production; monitor audit logs for unauthorized access attempts.
