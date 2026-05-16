'use client';

import type { RoomUser } from '@/types';

interface Props {
  users: RoomUser[];
  myId:  string | null;
}

export function UserList({ users, myId }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {users.map((user) => (
        <div
          key={user.id}
          title={user.is_host ? 'Host' : undefined}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
            ${user.id === myId
              ? 'bg-brand/20 text-brand-light border border-brand/40'
              : 'bg-gray-800 text-gray-300'}`}
        >
          {/* Avatar letter */}
          <span className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center
                           text-[10px] font-bold uppercase flex-shrink-0">
            {user.name[0]}
          </span>
          {user.name}
          {user.is_host && (
            <svg className="w-3 h-3 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm2 3h10v2H7v-2z"/>
            </svg>
          )}
          {user.id === myId && (
            <span className="text-gray-500">(you)</span>
          )}
        </div>
      ))}
    </div>
  );
}
