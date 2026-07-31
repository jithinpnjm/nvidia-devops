import React, {type ReactNode} from 'react';

export default function MemoryHook({children}: {children: ReactNode}) {
  return <aside className="memoryHook"><strong>Memory hook</strong><div>{children}</div></aside>;
}
