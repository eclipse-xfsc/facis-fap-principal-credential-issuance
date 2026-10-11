import fs from 'node:fs';
const source=fs.readFileSync(new URL('../automation/stage1/ground-zero.sh',import.meta.url),'utf8');
const start="cat <<'SQL' >\"$TMP_DIR/schema.sql\"\n",offset=source.indexOf(start);
if(offset<0)throw new Error('Schema block not found');const end=source.indexOf('\nSQL\n',offset+start.length);if(end<0)throw new Error('Unterminated schema block');
export const schema=source.slice(offset+start.length,end)+'\n';
if(process.argv[1]?.endsWith('extract-schema.mjs'))process.stdout.write(schema);
