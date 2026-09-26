export interface Role { id: number; name: string; }
export interface User {
  id: number; username: string; email?: string;
  role: string; status: string; created_at: string;
}
export interface Device {
  id: number; device_uid: string; name: string;
  owner_id: number; location?: string;
  status: string; // registered|provisioned|active|offline|fault|maintenance|decommissioned
  firmware_version?: string; api_key?: string;
  last_heartbeat_at?: string; created_at: string;
}
export interface Telemetry {
  id: number; device_id: number;
  sensor_type: string; // light|soil|air_temp|air_humidity|rain|waterlevel
  value: number; unit?: string; timestamp: string;
}
export interface Command {
  id: number; command_id: string; device_id: number;
  action: string; status: string; // pending|executed|failed
  issued_at: string; executed_at?: string;
  retry_count: number;
}
export interface Alert {
  id: number; device_id: number; message: string;
  severity: string; // info|warning|critical
  status: string; // open|acknowledged|resolved
  created_at: string;
}
export interface AuditLog {
  id: number; user_id?: number; action: string;
  target?: string; timestamp: string;
}
export interface DeviceLifecycleLog {
  id: number; device_id: number;
  from_state?: string; to_state: string;
  changed_by?: number; timestamp: string;
}
export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
}
