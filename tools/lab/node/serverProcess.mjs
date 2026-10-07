// The lab server's own process (tools/lab): started by its supervisor (supervisor.mjs), with the stamp of the code it
// loaded, which every command's is checked against.
import { codeStamp } from './codeStamp.mjs';
import { LAB_PORT } from './paths.mjs';
import { serve } from './server.mjs';

serve(LAB_PORT, codeStamp());
