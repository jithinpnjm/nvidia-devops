with open('docs/nvidia-zero-to-hero/volume-02/chapter-03-threads-warps-blocks-and-sms.md', 'r') as f:
    content = f.read()

bad_mermaid = """```mermaid
flowchart TD
    subgraph "Software (The Code)"
        Grid[Grid: The Entire Kernel Launch]
        Grid --> Block1[Thread Block 1<br>(e.g., 256 Threads)]
        Grid --> Block2[Thread Block 2<br>(e.g., 256 Threads)]
        Grid --> Block3[Thread Block 3]
        Grid --> BlockN[Thread Block N]
    end
    
    subgraph "Hardware (The Physical GPU)"
        GTE((GigaThread Engine<br>Scheduler))
        
        SM1[Streaming Multiprocessor 1<br>Executes Block 1 & 3]
        SM2[Streaming Multiprocessor 2<br>Executes Block 2]
        SM_N[Streaming Multiprocessor N<br>Executes Block N]
    end"""

good_mermaid = """```mermaid
flowchart TD
    subgraph "Software (The Code)"
        Grid["Grid: The Entire Kernel Launch"]
        Grid --> Block1["Thread Block 1<br>(e.g., 256 Threads)"]
        Grid --> Block2["Thread Block 2<br>(e.g., 256 Threads)"]
        Grid --> Block3["Thread Block 3"]
        Grid --> BlockN["Thread Block N"]
    end
    
    subgraph "Hardware (The Physical GPU)"
        GTE(("GigaThread Engine<br>Scheduler"))
        
        SM1["Streaming Multiprocessor 1<br>Executes Block 1 & 3"]
        SM2["Streaming Multiprocessor 2<br>Executes Block 2"]
        SM_N["Streaming Multiprocessor N<br>Executes Block N"]
    end"""

content = content.replace(bad_mermaid, good_mermaid)

with open('docs/nvidia-zero-to-hero/volume-02/chapter-03-threads-warps-blocks-and-sms.md', 'w') as f:
    f.write(content)
