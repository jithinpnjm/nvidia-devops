with open('src/components/PythonPlayground/index.tsx', 'r') as f:
    content = f.read()

# Replace the old button logic
old = '''<button className="secondary" onClick={() => setShowSolution(!showSolution)}>{showSolution ? 'Hide solution' : 'Reveal solution'}</button>
    {showSolution && <div className="solution"><pre><code>{exercise.solution}</code></pre><p>{exercise.explanation}</p></div>}'''

new = '''<details className="solutionDropdown">
      <summary>Reveal Reference Solution & Explanation</summary>
      <div className="solutionContent">
        <pre><code>{exercise.solution}</code></pre>
        <div className="learningCallout">
          <strong>Why this matters in production</strong>
          <p>{exercise.explanation}</p>
        </div>
      </div>
    </details>'''

content = content.replace(old, new)

# Also remove the `showSolution` state definition and its effect resetting to avoid warnings
content = content.replace("const [showSolution, setShowSolution] = useState(false);", "")
content = content.replace("setShowSolution(false); ", "")

with open('src/components/PythonPlayground/index.tsx', 'w') as f:
    f.write(content)

