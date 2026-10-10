import {loadWorkData} from '@/app/work-actions';
import {workReadResponse} from '@/lib/work-read-response';
export const runtime='nodejs';
export async function GET(request:Request){
 return workReadResponse(await loadWorkData(),request.headers.get('if-none-match'));
}
