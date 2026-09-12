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
