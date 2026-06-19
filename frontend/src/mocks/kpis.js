export const mockKpis = {
  total_conversations: 142,
  active_today: 23,
  human_takeover: 4,
  ai_resolution_rate: 78,
  avg_response_time: '1m 24s',
  new_leads: 17,
  leads_by_stage: {
    new: 5,
    contacted: 4,
    qualified: 3,
    proposal: 3,
    closed: 2,
  },
  messages_today: 381,
  channels: [
    { name: 'WhatsApp', count: 89, color: '#25D366' },
    { name: 'Instagram', count: 31, color: '#E1306C' },
    { name: 'Messenger', count: 22, color: '#0084FF' },
  ],
}

export const mockLeads = [
  { id: 1, contact: { name: 'Sofía Ramírez' }, stage: 'proposal', value: 285000, owner: 'Ana García', tags: ['urgente', 'comercial'] },
  { id: 2, contact: { name: 'Luis Hernández' }, stage: 'qualified', value: 120000, owner: 'Pedro Ruiz', tags: ['residencial'] },
  { id: 3, contact: { name: 'Diana Castro' }, stage: 'contacted', value: 450000, owner: 'Ana García', tags: ['industrial', 'grande'] },
  { id: 4, contact: { name: 'Carlos Mendoza' }, stage: 'new', value: null, owner: null, tags: [] },
  { id: 5, contact: { name: 'Roberto Díaz' }, stage: 'closed', value: 195000, owner: 'Pedro Ruiz', tags: ['residencial'] },
]
