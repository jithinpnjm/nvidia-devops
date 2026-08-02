import React from 'react';
import Layout from '@theme/Layout';
import InteractiveGpuTopology from '@site/src/components/diagrams/InteractiveGpuTopology';
import FlowDiagram from '@site/src/components/diagrams/FlowDiagram';
import VisualMemoryBoard from '@site/src/components/diagrams/VisualMemoryBoard';
import useBaseUrl from '@docusaurus/useBaseUrl';
import ChatGPTStudyLink from '@site/src/components/learning/ChatGPTStudyLink';

const groups: [string, [string, string[]][]][] = [
  ['Linux & containers', [
    ['Process and syscall path',['process/thread','libc/runtime','syscall','kernel subsystem','device']], ['CPU scheduling',['runnable task','per-CPU run queue','scheduler','CPU','context switch']],
    ['Page fault and pressure',['virtual address','page-table miss','minor/major fault','page cache / storage','reclaim / OOM']], ['Storage path',['file descriptor','VFS','filesystem','block layer','NVMe']],
    ['Network path',['socket','TCP/IP','routing','netfilter','NIC']], ['Container launch',['image','containerd','OCI runtime','namespaces + cgroups','process']],
  ]],
  ['Kubernetes', [
    ['Reconciliation loop',['desired object','API server / etcd','watch','controller','observed status']], ['Request admission',['authentication','authorization','admission','validation','etcd']],
    ['Scheduling',['pending Pod','filter','score','reserve / permit','bind']], ['Node lifecycle',['kubelet','CRI','containerd','OCI runtime','container']],
    ['Service and CNI',['client Pod','CoreDNS','Service VIP','CNI dataplane','endpoint Pod']], ['Persistent storage',['PVC','scheduler topology','CSI provisioner','PV attach','mount']],
    ['HPA pipeline',['workload metrics','adapter','HPA controller','desired replicas','Deployment']], ['Node pressure',['kubelet signals','threshold','reclaim','eviction ranking','Pod eviction']],
  ]],
  ['GPU platform', [
    ['CUDA stack',['application','CUDA runtime','user driver','kernel driver','GPU']], ['GPU Operator',['ClusterPolicy','operand controllers','driver/toolkit','device plugin','DCGM']],
    ['GPU allocation',['Pod request','scheduler','device plugin / DRA','CDI injection','GPU process']], ['Sharing choice',['isolation need','MIG','time slicing','MPS','validate workload fit']],
    ['Telemetry',['GPU','DCGM','exporter','Prometheus','SLO / alert']],
  ]],
  ['Distributed AI & fabric', [
    ['Parallelism',['data parallel','tensor parallel','pipeline parallel','expert parallel']], ['Collectives',['rank buffers','ReduceScatter','compute','AllGather','synchronized result']],
    ['NCCL ring intuition',['rank 0','rank 1','rank 2','rank 3','rank 0']], ['GPU Direct path',['GPU memory','PCIe / NVLink','NIC','RDMA fabric','remote GPU memory']],
    ['Multi-rail topology',['GPU locality','NIC rail A/B','leaf pair','spine','peer rail A/B']],
  ]],
  ['AI inference', [
    ['Token lifecycle',['request','tokenizer','prefill','KV cache','decode / stream']], ['Continuous batching',['arrival queue','admission','active sequences','iteration scheduler','completed requests']],
    ['Serving boundary',['gateway','model server','TensorRT-LLM / vLLM / NIM','GPU','telemetry']], ['Disaggregated serving',['router','prefill pool','KV transfer','decode pool','stream']],
  ]],
  ['Observability & architecture', [
    ['Metrics evidence',['instrumentation','scrape/export','time series','query','dashboard / alert']], ['Trace evidence',['context propagation','spans','collector','trace store','critical path']],
    ['USE / RED',['resource or service','utilization / rate','saturation / errors','errors / duration','hypothesis']], ['AI factory',['data + models','compute fabric','scheduler/platform','serving/training','operations + governance']],
    ['Hybrid scheduling',['shared identity/data','Kubernetes pools','capacity boundary','Slurm partitions','shared telemetry']],
  ]],
  ['Solutions architecture', [
    ['Discovery to design',['stakeholder interview','requirements + unknowns','constraints','trade-off matrix','recommended design']], ['TCO / capacity model',['demand forecast','per-request cost','utilization + headroom','GPU-hour estimate','sensitivity range']],
    ['PoC design',['risky assumption','hypothesis','representative workload','acceptance threshold','go/no-go decision']], ['Migration and adoption',['current state','target state','phased cutover','rollback plan','steady state']],
    ['Kubernetes vs Slurm call',['workload mix','scheduler fit per workload','shared identity/telemetry','capacity handoff','hybrid platform']],
  ]],
  ['Interview practice', [
    ['Answer framework',['clarify','model','hypothesize','test','recommend']], ['Customer discovery',['stated ask','probing questions','workload profile','constraints','PoC scope']],
    ['Whiteboard method',['requirements','data/control paths','component choices','trade-offs','open risks']], ['Behavioral story (STAR)',['situation','task','action','result','lesson']],
    ['Troubleshooting narration',['symptom','competing hypotheses','high-information check','root cause','safe mitigation']],
  ]],
];

export default function Visuals() { const heroImage = useBaseUrl('/img/visuals/ai-factory-memory-anchor.png'); const prompt = `Act as my visual systems tutor for the NVIDIA DevOps and AI infrastructure academy. Use the diagrams on this page as the starting evidence. Pick one model at a time and teach it from first principles: name the user-visible problem, define every node and arrow, explain what is control-plane versus data-plane, connect it to one concrete NVIDIA/Linux/Kubernetes/HPC example, and identify the failure boundary at each hop. Ask me to trace the path in my own words before revealing the explanation. Then give one read-only command or metric that would test the model, expected simulated output, what it proves, and what it cannot prove. Finish with a memory hook, a beginner check, and a senior interview follow-up. Do not treat a diagram as proof of a live system.`; return <Layout title="Visual learning"><main className="pageShell"><header className="pageHeader visualsHero"><div><span className="eyebrow">Systems atlas</span><h1>Visual learning</h1><p>Compact flows expose boundaries, control loops, data paths, and failure domains. Use them alongside—not instead of—the full curriculum.</p><section className="chatgptCoachPanel"><div><span className="eyebrow">Interactive diagram tutor</span><h3>Trace any visual with ChatGPT</h3><p>ChatGPT will make you explain each arrow, test the model with evidence, and connect the visual to real operations.</p></div><details><summary>Preview the visual-study prompt</summary><pre className="promptPreview">{prompt}</pre></details><ChatGPTStudyLink prompt={prompt} label="Study these diagrams in ChatGPT ↗"/></section></div><img src={heroImage} alt="Original illustration of GPU servers connected to storage and high-speed AI infrastructure fabric."/></header><section><h2>Ten models worth remembering</h2><p>Choose a model, trace the arrows, then restate the memory hook before moving to the detailed lesson.</p><VisualMemoryBoard/></section><section><h2>Interactive GPU / NUMA / fabric topology</h2><InteractiveGpuTopology/></section>{groups.map(([name, flows]) => <section key={name}><h2>{name}</h2><div className="flowGrid">{flows.map(([title, nodes]) => <FlowDiagram key={title} title={title} nodes={nodes}/>)}</div></section>)}</main></Layout>; }
