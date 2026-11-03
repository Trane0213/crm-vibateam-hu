import {it,expect} from 'vitest';
import {progressLabel} from './progress';
it('failed read cannot become completed-operation progress',()=>{expect(progressLabel('crm_read_email_thread','running',true)).not.toContain('Ellenőriztem');});
it('running with no completed tool does not claim CRM reading',()=>{expect(progressLabel(null,'running')).not.toContain('CRM');});