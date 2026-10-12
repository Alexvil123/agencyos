import {loadWorkData} from '@/app/work-actions';
import {workReadResponse} from '@/lib/work-read-response';
export const runtime='nodejs';
export async function GET(request:Request){
 const scope=new URL(request.url).searchParams.get('scope')==='overview'?'overview':'full';
 return workReadResponse(await loadWorkData(scope),request.headers.get('if-none-match'));
}
