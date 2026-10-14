import json,re,sys,concurrent.futures as cf,subprocess
urls=json.load(open('data/urls.json'))
skip=re.compile(r'^https?://(localhost|127\.|10\.|192\.168\.|prometheus|grafana|example\.|.*\.internal|.*\.local|.*\.cluster|0\.0\.0\.0|<)')
todo=[u for u in urls if not skip.match(u) and '<' not in u and '{' not in u and '$' not in u and 'xxx' not in u.lower()]
def chk(u):
    try:
        r=subprocess.run(['curl','-s','-o','/dev/null','-L','-A','Mozilla/5.0 (nvingest link check)','--max-time','25','-w','%{http_code}',u],capture_output=True,text=True,timeout=40).stdout
    except Exception as e: r='ERR'
    return u,r
res={}
with cf.ThreadPoolExecutor(6) as ex:
    for u,r in ex.map(chk,todo): res[u]=r
json.dump(res,open('data/url_status.json','w'))
bad={u:r for u,r in res.items() if r not in ('200','301','302','303','307','308')}
print(len(todo),'checked;',len(bad),'not OK')
for u,r in sorted(bad.items()): print(r,u,'|',urls[u][0])
