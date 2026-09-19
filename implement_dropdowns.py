import re

# 1. Update Troubleshooting
with open('src/pages/troubleshooting.tsx', 'r') as f:
    content = f.read()

# Replace <StaffLearningPanel ... /> with the details tag opening
old = '<StaffLearningPanel blueprint={learning} title={scenario.title} solutionSteps={solutionSteps} failures={[{failure: scenario.description, response: scenario.expectedRootCause}]} metrics={scenario.evidence.map((item) => `${item.action}: ${item.interpretation}`)} mode="incident"/>'

new = '''<details className="solutionDropdown">
            <summary>Reveal Diagnosis and Incident Runbook</summary>
            <div className="solutionContent">
              <StaffLearningPanel blueprint={learning} title={scenario.title} solutionSteps={solutionSteps} failures={[{failure: scenario.description, response: scenario.expectedRootCause}]} metrics={scenario.evidence.map((item) => `${item.action}: ${item.interpretation}`)} mode="incident"/>'''

content = content.replace(old, new)

# Close the details tag just before hypothesisNote
old2 = '<label className="hypothesisNote">'
new2 = '''</div>
          </details>
          
          <label className="hypothesisNote">'''
content = content.replace(old2, new2)

with open('src/pages/troubleshooting.tsx', 'w') as f:
    f.write(content)

# 2. Update Architecture
with open('src/pages/architecture.tsx', 'r') as f:
    content = f.read()

# For architecture, the answer starts at StaffLearningPanel
old3 = '<StaffLearningPanel blueprint={learning} title={scenario.title} solutionSteps={scenario.answerOutline} failures={scenario.failureModes} tradeoffs={scenario.tradeoffs} metrics={scenario.successMetrics} technologyDecisions={technologyDecisions}/>'
new3 = '''<details className="solutionDropdown">
            <summary>Reveal Recommended Architecture and Trade-offs</summary>
            <div className="solutionContent">
              <StaffLearningPanel blueprint={learning} title={scenario.title} solutionSteps={scenario.answerOutline} failures={scenario.failureModes} tradeoffs={scenario.tradeoffs} metrics={scenario.successMetrics} technologyDecisions={technologyDecisions}/>'''

content = content.replace(old3, new3)

# Close details tag just before hypothesisNote
old4 = '<label className="hypothesisNote">'
new4 = '''</div>
          </details>
          
          <label className="hypothesisNote">'''
content = content.replace(old4, new4)

with open('src/pages/architecture.tsx', 'w') as f:
    f.write(content)


# 3. Update Custom CSS
with open('src/css/custom.css', 'a') as f:
    f.write('''

/* Interactive Solution Dropdowns for /labs, /troubleshooting, /architecture */
.solutionDropdown {
  margin-top: 2rem;
  margin-bottom: 2rem;
  border: 1px solid var(--ifm-color-emphasis-300);
  border-radius: 8px;
  background: var(--ifm-color-emphasis-100);
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.solutionDropdown > summary {
  padding: 1.2rem;
  cursor: pointer;
  font-weight: 700;
  font-size: 1.1rem;
  background: var(--ifm-color-primary-dark);
  color: white;
  list-style: none; /* Hide default triangle */
  user-select: none;
  display: flex;
  align-items: center;
  transition: background-color 0.2s;
}

.solutionDropdown > summary::-webkit-details-marker {
  display: none;
}

.solutionDropdown > summary::before {
  content: '▶';
  display: inline-block;
  margin-right: 0.8rem;
  transition: transform 0.2s;
  font-size: 0.9rem;
}

.solutionDropdown[open] > summary::before {
  transform: rotate(90deg);
}

.solutionDropdown[open] > summary {
  background: var(--ifm-color-primary-darker);
  border-bottom: 1px solid var(--ifm-color-emphasis-300);
}

.solutionContent {
  padding: 2rem;
  background: var(--ifm-background-surface-color);
}
''')
