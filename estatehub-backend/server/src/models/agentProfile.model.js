// src/models/agentProfile.model.js

const { pool } = require('../config/db');

async function findByAgentId(agentId) {
  const { rows } = await pool.query('SELECT * FROM agent_profiles WHERE agent_id = :agentId LIMIT 1', { agentId });
  return rows[0] || null;
}

async function upsert(agentId, fields) {
  const allowed = ['bio', 'company_website', 'office_address'];
  const data = {};
  Object.entries(fields).forEach(([key, value]) => {
    if (allowed.includes(key) && value !== undefined) data[key] = value;
  });

  const existing = await findByAgentId(agentId);

  if (existing) {
    const setClauses = Object.keys(data).map((key) => `${key} = :${key}`);
    if (setClauses.length > 0) {
      await pool.query(`UPDATE agent_profiles SET ${setClauses.join(', ')} WHERE agent_id = :agentId`, {
        ...data,
        agentId,
      });
    }
  } else {
    const columns = ['agent_id', ...Object.keys(data)];
    const placeholders = columns.map((c) => (c === 'agent_id' ? ':agentId' : `:${c}`));
    await pool.query(
      `INSERT INTO agent_profiles (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
      { ...data, agentId }
    );
  }

  return findByAgentId(agentId);
}

module.exports = { findByAgentId, upsert };
