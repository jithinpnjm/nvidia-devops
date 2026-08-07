---
title: "Lab 4 - Deploy Restricted Pod with Network Policy"
slug: "lab-04-deploy-restricted-pod"
sidebar_position: 4
description: "Deploy a Pod with Pod Security Standards enforcement; create Network Policies; test that restrictions are enforced."
---

# Lab 4 — Deploy Restricted Pod with Network Policy

**Objective:** Create a security-hardened namespace with Pod Security Standards; deploy a pod with network isolation; verify restrictions work.

**Estimated time:** 60 minutes

**Prerequisites:**
- Kubernetes cluster with Pod Security admission controller enabled
- Network policy support (CNI with network policy enforcement)
- kubectl access

## Step 1: Create a Restricted Namespace

```yaml
---
apiVersion: v1
kind: Namespace
metadata:
  name: secure-inference
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

```bash
$ kubectl apply -f namespace.yaml
```

## Step 2: Deploy Default-Deny Network Policy

```yaml
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: secure-inference
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  # Empty rules = deny all
```

```bash
$ kubectl apply -f network-policy-deny.yaml
```

## Step 3: Deploy a Restricted Pod

```yaml
---
apiVersion: v1
kind: Pod
metadata:
  name: secure-app
  namespace: secure-inference
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 2000
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: python:3.11-slim
    command: ["python", "-m", "http.server", "8080"]
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop:
        - ALL
        add:
        - NET_BIND_SERVICE
    volumeMounts:
    - name: tmp
      mountPath: /tmp
  volumes:
  - name: tmp
    emptyDir: {}
```

```bash
$ kubectl apply -f secure-pod.yaml
```

## Step 4: Test Pod Cannot Read as Root (Should Fail)

```bash
$ kubectl exec secure-app -- id
uid=1000 gid=2000 groups=2000
# Successfully runs as UID 1000, not root (0)
```

## Step 5: Test Pod Cannot Write to Root Filesystem (Should Fail)

```bash
$ kubectl exec secure-app -- touch /root/test.txt
touch: cannot touch '/root/test.txt': Read-only file system
# Correctly denied
```

## Step 6: Test Pod Can Write to /tmp (Should Succeed)

```bash
$ kubectl exec secure-app -- sh -c "echo test > /tmp/test.txt && cat /tmp/test.txt"
test
# Works as expected
```

## Step 7: Create Ingress-Allow Policy for API Gateway

```yaml
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-gateway
  namespace: secure-inference
spec:
  podSelector:
    matchLabels:
      app: secure-app
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api-gateway
    ports:
    - protocol: TCP
      port: 8080
```

```bash
$ kubectl apply -f network-policy-ingress.yaml
```

## Step 8: Test Network Isolation

```bash
# Deploy test pod (outside namespace) that attempts connection
$ kubectl run test-pod --image=curlimages/curl --rm -it \
  --namespace secure-inference \
  -- sh -c "curl -v http://secure-app:8080"
# Should timeout or connection refused (policy denies it)

# Label the test pod as api-gateway and retry
$ kubectl label pod test-pod app=api-gateway -n secure-inference
$ kubectl exec test-pod -- curl http://secure-app:8080
# Should now succeed (policy allows it)
```

## Step 9: Verify Pod Security Policy Rejection

```bash
# Try to deploy an insecure pod (runs as root)
$ cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: insecure-pod
  namespace: secure-inference
spec:
  securityContext:
    runAsUser: 0  # root
  containers:
  - name: app
    image: ubuntu
EOF

error: failed to create Pod: pods "insecure-pod" is forbidden: violates PodSecurity "restricted:latest": runAsUser=0
# Correctly rejected by PSS admission controller
```

## Deliverable

Document your security setup:

```
NAMESPACE: secure-inference
POD SECURITY STANDARD: restricted

POD SECURITY RESULTS:
  - Runs as non-root (UID 1000): YES
  - Read-only root filesystem: YES
  - No privilege escalation: YES
  - All capabilities dropped: YES
  - Insecure pod rejected: YES

NETWORK POLICY:
  - Default-deny ingress: YES
  - Default-deny egress: YES
  - Selective allow: YES

NETWORK ISOLATION RESULTS:
  - Unauthorized pod denied connection: YES
  - Authorized pod allowed connection: YES
  - Policy logged in audit: YES
```

## Next Steps

Deploy this namespace template to your production cluster; monitor for policy violations in audit logs.
