export type AmoImportOptions = {
  accountSubdomain: string;
  accessToken: string;
};

export async function importFromAmo(_options: AmoImportOptions) {
  return {
    leads: 0,
    contacts: 0,
    tasks: 0,
    notes: 0,
    users: 0,
    pipelines: 0,
    stages: 0,
    customFields: 0
  };
}
