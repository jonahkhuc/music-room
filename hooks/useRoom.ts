'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  Room, RoomUser, QueueItem, PlayerState, Song,
  ChatMessage, JoinRequest,
  ServerToClientEvents, ClientToServerEvents,
} from '@/types';

type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const INITIAL_PLAYER: PlayerState = {
  current_song: null, is_playing: false, current_time: 0, updated_at: 0,
};

export function useRoom(roomCode: string, userName: string) {
  const socketRef   = useRef<RoomSocket | null>(null);
  const mySocketId  = useRef<string>('');

  const [connected,    setConnected]    = useState(false);
  const [room,         setRoom]         = useState<Room | null>(null);
  const [users,        setUsers]        = useState<RoomUser[]>([]);
  const [queue,        setQueue]        = useState<QueueItem[]>([]);
  const [playerState,  setPlayerState]  = useState<PlayerState>(INITIAL_PLAYER);
  const [messages,     setMessages]     = useState<ChatMessage[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [myId,         setMyId]         = useState<string | null>(null);
  const [isHost,       setIsHost]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode || !userName) return;

    const socket: RoomSocket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      mySocketId.current = socket.id ?? '';
      socket.emit('join_room', { roomCode, userName });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('room_state', (state) => {
      setRoom(state.room);
      setUsers(state.users);
      setQueue(state.queue);
      setPlayerState(state.player);
      setMessages(state.messages ?? []);

      const me = state.users.find((u) => u.socket_id === socket.id);
      if (me) { setMyId(me.id); setIsHost(me.is_host); }
    });

    socket.on('user_joined', (user) => {
      setUsers((prev) => prev.find((u) => u.id === user.id) ? prev : [...prev, user]);
    });

    socket.on('user_left', (userId) => {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    });

    socket.on('queue_updated',        setQueue);
    socket.on('player_state_changed', setPlayerState);

    socket.on('chat_message', (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });

    socket.on('join_requests_state', setJoinRequests);
    socket.on('join_request', (req) => {
      setJoinRequests((prev) => (prev.some((r) => r.id === req.id) ? prev : [...prev, req]));
    });

    socket.on('host_changed', (newHostId) => {
      setIsHost(newHostId === myId);
      setUsers((prev) =>
        prev.map((u) => ({ ...u, is_host: u.id === newHostId })),
      );
    });

    socket.on('error', (msg) => setError(msg));

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [roomCode, userName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep isHost in sync when users list updates (e.g. after host transfer)
  useEffect(() => {
    if (!myId) return;
    const me = users.find((u) => u.id === myId);
    if (me) setIsHost(me.is_host);
  }, [users, myId]);

  const addSong     = useCallback((song: Omit<Song, 'id'>) =>
    socketRef.current?.emit('add_song', song), []);

  const nextSong    = useCallback(() =>
    socketRef.current?.emit('next_song'), []);

  const prevSong    = useCallback(() =>
    socketRef.current?.emit('prev_song'), []);

  const playSong    = useCallback((queueItemId: string) =>
    socketRef.current?.emit('play_song', queueItemId), []);

  const togglePlay  = useCallback((isPlaying: boolean) =>
    socketRef.current?.emit('toggle_play', isPlaying), []);

  const seek        = useCallback((seconds: number) =>
    socketRef.current?.emit('seek', seconds), []);

  const requestSync = useCallback(() =>
    socketRef.current?.emit('sync_request'), []);

  const sendChat    = useCallback((text: string) =>
    socketRef.current?.emit('send_chat', text), []);

  const respondJoin = useCallback((requestId: string, approved: boolean) =>
    socketRef.current?.emit('respond_join', { requestId, approved }), []);

  const reportProgress = useCallback((seconds: number) =>
    socketRef.current?.emit('report_progress', seconds), []);

  return {
    connected, room, users, queue, playerState, messages, joinRequests,
    myId, isHost, error,
    addSong, nextSong, prevSong, playSong, togglePlay, seek, requestSync,
    sendChat, respondJoin, reportProgress,
  };
}
