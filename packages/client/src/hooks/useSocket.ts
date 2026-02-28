import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useShowStore } from '../store/useShow.js';
import type { WsDmxTick, WsStateUpdate, WsCueActive, WsChaseStep } from '@dmx-console/shared';

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io('/', { path: '/socket.io' });
  }
  return socket;
}

export function useSocket(): Socket {
  const sock = useRef<Socket>(getSocket());
  const setDmxTick = useShowStore((s) => s.setDmxTick);
  const applyStateUpdate = useShowStore((s) => s.applyStateUpdate);

  useEffect(() => {
    const s = sock.current;

    s.on('connect', () => console.log('[socket] connected'));
    s.on('disconnect', () => console.log('[socket] disconnected'));

    s.on('dmx:tick', (data: WsDmxTick) => setDmxTick(data));
    s.on('state:update', (data: WsStateUpdate) => applyStateUpdate(data));
    s.on('cue:active', (_data: WsCueActive) => {
      /* handled by applyStateUpdate */
    });
    s.on('chase:step', (_data: WsChaseStep) => {
      /* handled by applyStateUpdate */
    });

    return () => {
      s.off('connect');
      s.off('disconnect');
      s.off('dmx:tick');
      s.off('state:update');
      s.off('cue:active');
      s.off('chase:step');
    };
  }, [setDmxTick, applyStateUpdate]);

  return sock.current;
}
