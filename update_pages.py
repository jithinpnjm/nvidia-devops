import re

def update_troubleshooting():
    with open('src/pages/troubleshooting.tsx', 'r') as f:
        content = f.read()

    # Find the place to inject the details tag
    # After <div className="incidentScenarioStatement"><strong>The scenario:</strong> {scenario.description}</div>
    # Before <StaffLearningPanel
    
    # We want to wrap the rest of the incident explanation in a details tag
    
    parts = content.split('<StaffLearningPanel blueprint={learning}')
    if len(parts) != 2:
        return
        
    # We will put a details tag around the solution.
    # Actually, the user wants the "answers and solutions" in an expandable dropdown.
    # The StaffLearningPanel is part of the "healthy system" which might give away the answer? 
    # Or maybe the "Walking through the diagnosis" is what they want hidden.
    
    # Let's wrap everything from <StaffLearningPanel ... to the end of the section
    # wait, the end of the section is just before <label className="hypothesisNote">
    
    # Let's replace:
    old = '<StaffLearningPanel blueprint={learning} title={scenario.title} solutionSteps={solutionSteps} failures={[{failure: scenario.description, response: scenario.expectedRootCause}]} metrics={scenario.evidence.map((item) => `${item.action}: ${item.interpretation}`)} mode="incident"/>'
    
    new = '''<details className="solutionDropdown">
            <summary className="button primary">Reveal Diagnosis and Solution</summary>
            <div className="solutionContent">
              <StaffLearningPanel blueprint={learning} title={scenario.title} solutionSteps={solutionSteps} failures={[{failure: scenario.description, response: scenario.expectedRootCause}]} metrics={scenario.evidence.map((item) => `${item.action}: ${item.interpretation}`)} mode="incident"/>'''
              
    content = content.replace(old, new)
    
    # Now close the div and details before the hypothesis note
    old2 = '<label className="hypothesisNote">'
    new2 = '''</div>
          </details>
          
          <label className="hypothesisNote">'''
    content = content.replace(old2, new2)
    
    with open('src/pages/troubleshooting.tsx', 'w') as f:
        f.write(content)


def update_architecture():
    with open('src/pages/architecture.tsx', 'r') as f:
        content = f.read()

    old = '<StaffLearningPanel blueprint={learning} title={scenario.title} solutionSteps={scenario.solutionSteps} tradeoffs={scenario.tradeoffs} technologyDecisions={technologyDecisions}/>'
    new = '''<details className="solutionDropdown">
            <summary className="button primary">Reveal Architecture Solution</summary>
            <div className="solutionContent">
              <StaffLearningPanel blueprint={learning} title={scenario.title} solutionSteps={scenario.solutionSteps} tradeoffs={scenario.tradeoffs} technologyDecisions={technologyDecisions}/>'''
              
    content = content.replace(old, new)
    
    # Find the closing spot
    old2 = '<label className="hypothesisNote">'
    new2 = '''</div>
          </details>
          
          <label className="hypothesisNote">'''
    content = content.replace(old2, new2)
    
    with open('src/pages/architecture.tsx', 'w') as f:
        f.write(content)

update_troubleshooting()
update_architecture()
