// 0138 preview: admin Needs you with a Traveller check case (SAMPLE data; the Supabase calls are answered by the screenshot script)
import '../src/venue/admin2.css';
import { inboxView, loadSnapshot } from '../src/venue/adminV2';
location.hash = '#inbox';
void loadSnapshot(true).then(() => inboxView());
