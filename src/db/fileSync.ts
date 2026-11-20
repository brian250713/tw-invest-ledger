import { buildBackupPayload } from './backup';
import { db } from './schema';

export type FileSyncPermission = 'granted' | 'prompt' | 'denied' | 'none';

export interface LocalFileWritable {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}

export interface LocalFileHandle {
  name: string;
  createWritable: () => Promise<LocalFileWritable>;
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
}

export interface SavedFileHandleState {
  bound: boolean;
  fileName: string | null;
  permission: FileSyncPermission;
  handle: LocalFileHandle | null;
}

const FILE_HANDLE_KEY = 'local-backup-file';

interface PickerWindow {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<LocalFileHandle>;
}

export function isFileSystemSyncSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as PickerWindow).showSaveFilePicker === 'function'
  );
}

export async function writeBackupToHandle(handle: LocalFileHandle): Promise<void> {
  const payload = await buildBackupPayload();
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
  await db.appMeta.put({ key: 'lastBackupAt', value: new Date().toISOString() });
}

export async function pickAndBindLocalBackupFile(): Promise<SavedFileHandleState> {
  const picker = (window as unknown as PickerWindow).showSaveFilePicker;
  if (!picker) {
    throw new Error('此瀏覽器不支援本機檔案自動同步（請改用 Chrome / Edge 桌面版，或使用下方手動匯出 JSON）');
  }

  const handle = await picker({
    suggestedName: 'tw-invest-ledger-sync.json',
    types: [
      {
        description: 'JSON 備份檔案',
        accept: { 'application/json': ['.json'] },
      },
    ],
  });

  await writeBackupToHandle(handle);

  await db.fileHandles.put({
    key: FILE_HANDLE_KEY,
    fileName: handle.name,
    handle,
    boundAt: new Date().toISOString(),
  });

  return {
    bound: true,
    fileName: handle.name,
    permission: 'granted',
    handle,
  };
}

export async function getSavedFileHandleState(): Promise<SavedFileHandleState> {
  const saved = await db.fileHandles.get(FILE_HANDLE_KEY);
  if (!saved || !saved.handle) {
    return { bound: false, fileName: null, permission: 'none', handle: null };
  }

  const handle = saved.handle as LocalFileHandle;
  let permission: FileSyncPermission = 'prompt';
  try {
    if (typeof handle.queryPermission === 'function') {
      permission = await handle.queryPermission({ mode: 'readwrite' });
    }
  } catch {
    permission = 'prompt';
  }

  return {
    bound: true,
    fileName: saved.fileName || handle.name,
    permission,
    handle,
  };
}

export async function resumeSavedFileHandlePermission(): Promise<SavedFileHandleState> {
  const state = await getSavedFileHandleState();
  if (!state.bound || !state.handle) {
    throw new Error('尚未綁定本機備份檔案');
  }

  if (typeof state.handle.requestPermission === 'function') {
    const granted = await state.handle.requestPermission({ mode: 'readwrite' });
    if (granted !== 'granted') {
      return { ...state, permission: granted };
    }
  }

  await writeBackupToHandle(state.handle);
  return {
    ...state,
    permission: 'granted',
  };
}

export async function unbindLocalBackupFile(): Promise<void> {
  await db.fileHandles.delete(FILE_HANDLE_KEY);
}
