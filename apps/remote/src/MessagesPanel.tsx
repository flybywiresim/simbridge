import React from 'react';
import { useAppSelector } from './store';

export const MessagesPanel: React.FC = () => {
  const messages = useAppSelector((state) => state.messages);

  return (
    <pre className="max-w-[700px] overflow-hidden flex flex-col font-mono">
      {messages.slice(Math.max(0, messages.length - 10), messages.length - 1).map((it, i) => {
        const arrow = it.direction === 'up' ? ' ↑' : ' ↓';

        return (
          <span key={i}>
            {arrow} {it.contents}
          </span>
        );
      })}
    </pre>
  );
};
