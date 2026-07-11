"""Sprint 11E-1: Video Generation Spec tests."""

import os, sys, tempfile, unittest, sqlite3, time

if "TEST_DATABASE_PATH" not in os.environ:
    _fd, _path = tempfile.mkstemp(suffix=".sqlite3", prefix="test_vgs_")
    os.environ["TEST_DATABASE_PATH"] = _path
os.environ.pop("APIMART_API_KEY", None)

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../app")))
from main import init_db
from db.migrations import run_migrations
import db.sprint_11a; import db.sprint_11a3; import db.sprint_11b4; import db.sprint_11c; import db.sprint_11e1  # noqa
init_db()
_conn=sqlite3.connect(os.environ["TEST_DATABASE_PATH"]);_conn.execute("PRAGMA foreign_keys = ON");run_migrations(_conn.cursor());_conn.commit();_conn.close()

from app.repositories.video_generation_repository import create_spec, get_spec, get_spec_snapshot, get_all_specs

def _c(): c=sqlite3.connect(os.environ["TEST_DATABASE_PATH"]);c.row_factory=sqlite3.Row;c.execute("PRAGMA foreign_keys = ON");return c
_i=0
def _seed():
    global _i;_i+=1;iid=f"ins_vg{_i}"
    conn=_c();cur=conn.cursor()
    now=time.time()
    cur.execute("INSERT OR IGNORE INTO products (id, product_type, sku, title, created_at, updated_at) VALUES ('p1','desk_calendar','sk','t',?,?)",(now,now))
    cur.execute("INSERT OR IGNORE INTO video_instances (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",(iid,'b1','p1','t1','desk_calendar','sk','pending',now,now))
    conn.commit();conn.close()
    return iid


class TestVideoGenerationSpec(unittest.TestCase):

    def test_vg01_create_spec(self):
        iid=_seed()
        conn=_c();cur=conn.cursor()
        s=create_spec(cur,iid,"S01_main",prompt="产品展示",camera_motion="slow push",duration=5,style="commercial")
        conn.commit()
        self.assertEqual(s["shot_key"],"S01_main")
        self.assertEqual(s["prompt"],"产品展示")
        conn.close()

    def test_vg02_update_via_create(self):
        iid=_seed()
        conn=_c();cur=conn.cursor()
        create_spec(cur,iid,"S01_main",prompt="v1")
        conn.commit()
        # Re-create with same shot_key — should fail UNIQUE
        with self.assertRaises(sqlite3.IntegrityError):
            create_spec(cur,iid,"S01_main",prompt="v2")
            conn.commit()
        conn.close()

    def test_vg03_snapshot_frozen(self):
        iid=_seed()
        conn=_c();cur=conn.cursor()
        create_spec(cur,iid,"S01_main",prompt="original",camera_motion="push",duration=8,style="cinematic")
        conn.commit()
        snap=get_spec_snapshot(cur,iid,"S01_main")
        self.assertEqual(snap["prompt"],"original")
        self.assertEqual(snap["camera_motion"],"push")
        self.assertEqual(snap["duration"],8)
        conn.close()

    def test_vg04_snapshot_includes_defaults(self):
        iid=_seed()
        conn=_c();cur=conn.cursor()
        snap=get_spec_snapshot(cur,iid,"S01_main")  # no spec exists
        self.assertEqual(snap["shot_key"],"S01_main")
        self.assertEqual(snap["duration"],5)  # default
        conn.close()

    def test_vg05_provider_reads_spec(self):
        iid=_seed()
        conn=_c();cur=conn.cursor()
        from app.repositories.composition_repository import create_composition_state, create_composition_job
        from app.repositories.video_asset_repository import create_version, create_review
        try:create_composition_state(cur,iid,["S01_main"],{"S01_main":5})
        except:pass
        for sk in ["S01_main","S02_detail1","S03_detail2","S04_motion","S05_scene","S06_brand"]:
            v=create_version(cur,iid,sk,f"/v/{sk}.mp4");create_review(cur,v["id"],"approved")
        create_spec(cur,iid,"S01_main",prompt="test spec prompt",camera_motion="zoom",duration=10,style="cinematic")
        from app.services.composition_snapshot import build_source_snapshot
        snap=build_source_snapshot(cur,iid)
        job=create_composition_job(cur,iid,["S01_main"],{"S01_main":5},snap,1)
        conn.commit()
        # Verify snapshot includes generation spec
        jid=job["id"]
        from app.repositories.composition_repository import get_composition_job
        j=get_composition_job(cur,jid)
        shots=j["source_assets_snapshot"]["shots"]
        self.assertEqual(shots[0].get("generation_spec",{}).get("prompt"),"test spec prompt")
        self.assertEqual(shots[0].get("generation_spec",{}).get("camera_motion"),"zoom")
        # Provider reads it
        from app.providers.apimart_provider import APIMartProvider
        p=APIMartProvider(api_key="")
        result=p.compose(j["source_assets_snapshot"],jid)
        self.assertIn("provider_job_id",result)
        conn.close()

    def test_vg06_get_all_specs(self):
        iid=_seed()
        conn=_c();cur=conn.cursor()
        create_spec(cur,iid,"S01_main",prompt="a");create_spec(cur,iid,"S02_detail1",prompt="b")
        conn.commit()
        all_s=get_all_specs(cur,iid)
        self.assertGreaterEqual(len(all_s),2)
        conn.close()


if __name__=="__main__":
    unittest.main()
