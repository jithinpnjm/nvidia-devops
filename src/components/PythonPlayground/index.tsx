import React, {useEffect, useRef, useState} from 'react';
import Editor from '@monaco-editor/react';
import {progressStore} from '@site/src/components/learning/progressStore';

export type PythonExercise = {id: string; title: string; prompt: string; starter: string; expected: string; tests: string; hint: string; solution: string; explanation: string};
const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';

export default function PythonPlayground({exercise}: {exercise: PythonExercise}) {
  const [code, setCode] = useState(exercise.starter);
  const [output, setOutput] = useState('Runtime loads on first execution. Python runs in a disposable browser Web Worker.');
  const [running, setRunning] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const workerRef = useRef<Worker>();
  useEffect(() => { setCode(exercise.starter); setOutput('Ready.'); setShowSolution(false); }, [exercise]);
  useEffect(() => () => workerRef.current?.terminate(), []);

  const execute = (withTests: boolean) => {
    workerRef.current?.terminate();
    setRunning(true); setOutput('Loading Pyodide and executing…');
    const workerSource = `
      self.onmessage = async (event) => {
        let stdout = ''; let stderr = '';
        try {
          importScripts('${PYODIDE_URL}pyodide.js');
          const pyodide = await loadPyodide({indexURL: '${PYODIDE_URL}'});
          pyodide.setStdout({batched: (s) => stdout += s + '\\n'});
          pyodide.setStderr({batched: (s) => stderr += s + '\\n'});
          await pyodide.runPythonAsync(event.data.code);
          self.postMessage({ok: true, stdout, stderr});
        } catch (error) { self.postMessage({ok: false, stdout, stderr: stderr + String(error)}); }
      };`;
    const blob = new Blob([workerSource], {type: 'text/javascript'});
    const worker = new Worker(URL.createObjectURL(blob));
    workerRef.current = worker;
    const timer = window.setTimeout(() => {
      worker.terminate(); setRunning(false); setOutput('Execution stopped after the 12-second safety timeout.');
    }, 12_000);
    worker.onmessage = ({data}) => {
      clearTimeout(timer); worker.terminate(); setRunning(false);
      if (withTests && data.ok) progressStore.add('completedLabs', exercise.id);
      setOutput(`${data.stdout || ''}${data.stderr ? `\nSTDERR\n${data.stderr}` : ''}${withTests && data.ok ? '\n✓ Tests completed' : ''}`.trim() || 'Completed with no output.');
    };
    worker.postMessage({code: withTests ? `${code}\n\n${exercise.tests}` : code});
  };

  return <section className="pythonPlayground">
    <div className="playgroundHeader"><div><span className="eyebrow">Browser Python lab</span><h2>{exercise.title}</h2><p>{exercise.prompt}</p></div><span className="runtimeBadge">Pyodide · client-side only</span></div>
    <Editor height="360px" language="python" theme="vs-dark" value={code} onChange={(value) => setCode(value || '')} options={{fontSize: 14, minimap: {enabled: false}, automaticLayout: true, scrollBeyondLastLine: false}}/>
    <div className="buttonRow"><button disabled={running} onClick={() => execute(false)}>Run</button><button disabled={running} onClick={() => execute(true)}>Run tests</button><button className="secondary" onClick={() => setCode(exercise.starter)}>Reset</button></div>
    <div className="console"><strong>Output</strong><pre>{output}</pre></div>
    <details><summary>Hint</summary><p>{exercise.hint}</p></details>
    <p><strong>Expected:</strong> <code>{exercise.expected}</code></p>
    <button className="secondary" onClick={() => setShowSolution(!showSolution)}>{showSolution ? 'Hide solution' : 'Reveal solution'}</button>
    {showSolution && <div className="solution"><pre><code>{exercise.solution}</code></pre><p>{exercise.explanation}</p></div>}
  </section>;
}
