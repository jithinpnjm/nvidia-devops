import re

with open('src/css/custom.css', 'a') as f:
    f.write('''

.solutionDropdown {
  margin-top: 2rem;
  margin-bottom: 2rem;
  border: 1px solid var(--ifm-color-emphasis-200);
  border-radius: 8px;
  background: var(--ifm-color-emphasis-100);
}

.solutionDropdown > summary {
  padding: 1rem;
  cursor: pointer;
  font-weight: 600;
  background: var(--ifm-color-primary);
  color: white;
  border-radius: 8px;
  transition: background-color 0.2s;
  list-style: none; /* Hide default triangle on modern browsers */
}

.solutionDropdown > summary::-webkit-details-marker {
  display: none; /* Hide default triangle on Safari */
}

.solutionDropdown > summary::before {
  content: '▶';
  display: inline-block;
  margin-right: 0.5rem;
  transition: transform 0.2s;
}

.solutionDropdown[open] > summary::before {
  transform: rotate(90deg);
}

.solutionDropdown[open] > summary {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.solutionContent {
  padding: 2rem;
  background: var(--ifm-background-surface-color);
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}
''')
