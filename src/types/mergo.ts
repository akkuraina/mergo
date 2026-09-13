export type VersionRow = {
  id: string;
  doc_id: string;
  label: string | null;
  snapshot_text: string;
  created_by: string;
  created_by_name: string;
  created_by_image: string | null;
  op_cursor: number;
  created_at: string;
};

export type CollaboratorRow = {
  id: string;
  doc_id: string;
  user_id: string;
  user_name: string;
  user_image: string | null;
  joined_at: string;
  last_seen_at: string;
};
