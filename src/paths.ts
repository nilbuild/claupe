import { homedir } from "node:os";
import { join } from "node:path";

export const STATE_DIR = process.env.CLAUPE_STATE_DIR
  ?? join(homedir(), ".config", "claupe");

export const SOCKET_PATH = process.env.CLAUPE_SOCKET
  ?? join(STATE_DIR, "claupe.sock");

export const SESSIONS_FILE = join(STATE_DIR, "sessions.json");

export const DAEMON_LOG = join(STATE_DIR, "daemon.log");

export const PID_FILE = join(STATE_DIR, "daemon.pid");
