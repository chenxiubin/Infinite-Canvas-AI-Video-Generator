"""Test Pydantic schema validation for composition models."""

import unittest
from app.schemas.composition import (
    CompositionState,
    CompositionStateUpdate,
    CompositionJob,
    CompositionJobCreate,
    FinalVideoAsset,
)


class TestCompositionStateSchema(unittest.TestCase):

    def test_01_valid_state(self):
        s = CompositionState(
            instance_id="ins_1", composition_order=["S01_main"],
            timeline_durations={"S01_main": 5.0},
            version=1, created_at=100.0, updated_at=200.0,
        )
        self.assertEqual(s.instance_id, "ins_1")

    def test_02_empty_order_allowed(self):
        s = CompositionState(instance_id="ins_1", created_at=1.0, updated_at=1.0)
        self.assertEqual(s.composition_order, [])

    def test_03_empty_shot_key_rejected(self):
        with self.assertRaises(ValueError):
            CompositionState(instance_id="ins_1", composition_order=[""], created_at=1.0, updated_at=1.0)

    def test_04_duplicate_shot_key_rejected(self):
        with self.assertRaises(ValueError):
            CompositionState(instance_id="ins_1", composition_order=["S01","S01"], created_at=1.0, updated_at=1.0)

    def test_05_negative_duration_rejected(self):
        with self.assertRaises(ValueError):
            CompositionState(instance_id="ins_1", timeline_durations={"S01": -1}, created_at=1.0, updated_at=1.0)

    def test_06_zero_duration_rejected(self):
        with self.assertRaises(ValueError):
            CompositionState(instance_id="ins_1", timeline_durations={"S01": 0}, created_at=1.0, updated_at=1.0)

    def test_07_nan_duration_rejected(self):
        with self.assertRaises(ValueError):
            CompositionState(instance_id="ins_1", timeline_durations={"S01": float("nan")}, created_at=1.0, updated_at=1.0)

    def test_08_infinity_duration_rejected(self):
        with self.assertRaises(ValueError):
            CompositionState(instance_id="ins_1", timeline_durations={"S01": float("inf")}, created_at=1.0, updated_at=1.0)

    def test_09_empty_duration_key_rejected(self):
        with self.assertRaises(ValueError):
            CompositionState(instance_id="ins_1", timeline_durations={"": 5}, created_at=1.0, updated_at=1.0)


class TestCompositionStateUpdateSchema(unittest.TestCase):

    def test_10_expected_version_must_be_positive(self):
        with self.assertRaises(ValueError):
            CompositionStateUpdate(expected_version=0)

    def test_11_valid_update(self):
        u = CompositionStateUpdate(
            composition_order=["S01_main"], timeline_durations={"S01_main": 3.5}, expected_version=1,
        )
        self.assertEqual(u.expected_version, 1)


class TestCompositionJobSchema(unittest.TestCase):

    def test_12_illegal_status_rejected(self):
        with self.assertRaises(ValueError):
            CompositionJob(
                id="j1", instance_id="ins_1", status="idle",
                composition_order_snapshot=[], timeline_durations_snapshot={},
                source_assets_snapshot={}, source_state_version=1,
                progress=0, created_at=1.0, updated_at=1.0,
            )

    def test_13_queued_allowed(self):
        j = CompositionJob(
            id="j1", instance_id="ins_1", status="queued",
            composition_order_snapshot=[], timeline_durations_snapshot={},
            source_assets_snapshot={}, source_state_version=1,
            progress=0, created_at=1.0, updated_at=1.0,
        )
        self.assertEqual(j.status, "queued")

    def test_14_progress_out_of_range_rejected(self):
        with self.assertRaises(ValueError):
            CompositionJob(
                id="j1", instance_id="ins_1", status="queued",
                composition_order_snapshot=[], timeline_durations_snapshot={},
                source_assets_snapshot={}, source_state_version=1,
                progress=101, created_at=1.0, updated_at=1.0,
            )

    def test_15_source_state_version_must_be_positive(self):
        with self.assertRaises(ValueError):
            CompositionJobCreate(
                instance_id="ins_1", composition_order_snapshot=[],
                timeline_durations_snapshot={}, source_assets_snapshot={},
                source_state_version=0,
            )


class TestFinalVideoAssetSchema(unittest.TestCase):

    def test_16_valid_asset(self):
        a = FinalVideoAsset(
            id="fv1", instance_id="ins_1", video_url="/vid.mp4",
            version_number=1, version_label="v1", status="completed",
            is_current=False, created_at=1.0,
        )
        self.assertEqual(a.version_label, "v1")

    def test_17_invalid_status_rejected(self):
        with self.assertRaises(ValueError):
            FinalVideoAsset(
                id="fv1", instance_id="ins_1", video_url="/vid.mp4",
                version_number=1, version_label="v1", status="pending",
                is_current=False, created_at=1.0,
            )

    def test_18_empty_video_url_rejected(self):
        with self.assertRaises(ValueError):
            FinalVideoAsset(
                id="fv1", instance_id="ins_1", video_url="",
                version_number=1, version_label="v1", status="completed",
                is_current=False, created_at=1.0,
            )

    def test_19_version_less_than_1_rejected(self):
        with self.assertRaises(ValueError):
            FinalVideoAsset(
                id="fv1", instance_id="ins_1", video_url="/v.mp4",
                version_number=0, version_label="v0", status="completed",
                is_current=False, created_at=1.0,
            )


if __name__ == "__main__":
    unittest.main()
