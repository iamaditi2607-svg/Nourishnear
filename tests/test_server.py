import base64
import os
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import server


class NourishNearDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.database = Path(self.temporary_directory.name) / "test.db"
        self.database_patch = patch.object(server, "DATABASE", self.database)
        self.database_patch.start()
        server.initialize_database()
        self.real_geocoder = server.geocode_location
        self.geocoder_patch = patch.object(
            server, "geocode_location",
            return_value={
                "latitude": 26.8467, "longitude": 80.9462,
                "displayName": "Lucknow, Uttar Pradesh, India", "state": "Uttar Pradesh",
            },
        )
        self.geocoder_patch.start()
        self.requester = str(uuid4())
        self.donor = str(uuid4())

    def tearDown(self):
        self.geocoder_patch.stop()
        self.database_patch.stop()
        self.temporary_directory.cleanup()

    def test_pickup_reserves_quantity_atomically_and_scopes_history(self):
        pickup = server.Handler.create_pickup(
            object.__new__(server.Handler), self.requester,
            {"listingId": "seed-1", "quantity": 3},
        )
        self.assertEqual(pickup["listing"]["quantity"], 1)
        self.assertEqual(server.bootstrap(self.requester)["pickups"][0]["quantity"], 3)
        self.assertEqual(server.bootstrap(self.donor)["pickups"], [])
        with self.assertRaises(server.ApiError) as caught:
            server.Handler.create_pickup(
                object.__new__(server.Handler), self.donor,
                {"listingId": "seed-1", "quantity": 2},
            )
        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(server.bootstrap(self.donor)["listings"][0]["quantity"], 1)

    def test_need_pin_is_only_visible_to_its_owner_and_matched_helper(self):
        request = server.Handler.create_need(
            object.__new__(server.Handler), self.requester,
            {
                "requesterType": "Individual", "people": 2, "meal": "Vegetarian dinner",
                "details": "Dinner help", "location": "Gomti Nagar, Lucknow",
                "fulfilment": "Pickup works", "coordinates": {"latitude": 26.85, "longitude": 80.94},
            },
        )["need"]
        self.assertEqual(request["location"], "Gomti Nagar, Lucknow, Uttar Pradesh")
        public_request = next(item for item in server.bootstrap(self.donor)["needs"] if item["id"] == request["id"])
        self.assertNotIn("coordinates", public_request)
        self.assertIn("coordinates", next(item for item in server.bootstrap(self.requester)["needs"] if item["id"] == request["id"]))

        offer = server.Handler.create_offer(
            object.__new__(server.Handler), self.donor,
            {
                "needId": request["id"], "title": "Dinner", "category": "Meals", "quantity": 2,
                "location": "Gomti Nagar, Lucknow", "pickup": "Today evening", "source": "Home",
                "description": "Freshly cooked dinner",
            },
        )["listing"]
        self.assertEqual(offer["location"], "Gomti Nagar, Lucknow, Uttar Pradesh")
        self.assertEqual(offer["recipientCoordinates"], {"latitude": 26.85, "longitude": 80.94})
        public_offer = next(item for item in server.bootstrap(str(uuid4()))["listings"] if item["id"] == offer["id"])
        self.assertNotIn("recipientCoordinates", public_offer)

    def test_only_one_offer_can_match_a_request(self):
        request_id = "need-seed-1"
        payload = {
            "needId": request_id, "title": "Fresh dinner", "category": "Meals", "quantity": 3,
            "location": "Lucknow", "pickup": "Today evening", "source": "Home",
            "description": "Freshly cooked dinner",
        }
        server.Handler.create_offer(object.__new__(server.Handler), self.donor, payload)
        with self.assertRaises(server.ApiError) as caught:
            server.Handler.create_offer(object.__new__(server.Handler), self.requester, payload)
        self.assertEqual(caught.exception.status, 409)

    def test_new_food_listing_is_labeled_for_statewide_up_map(self):
        result = server.Handler.create_listing(
            object.__new__(server.Handler), self.donor,
            {
                "title": "Fresh khichdi", "category": "Meals", "quantity": 3, "unit": "servings",
                "location": "Gomti Nagar, Lucknow", "pickup": "Today evening",
                "source": "Home / household", "description": "Fresh vegetarian meal",
            },
        )
        self.assertEqual(result["listing"]["location"], "Gomti Nagar, Lucknow, Uttar Pradesh")
        self.assertEqual(result["listing"]["mapCoordinates"], {"latitude": 26.8467, "longitude": 80.9462})

    def test_new_location_anywhere_is_resolved_by_geocoding(self):
        with patch.object(server, "geocode_location", return_value={
            "latitude": 48.8566, "longitude": 2.3522, "state": "Ile-de-France",
        }):
            result = server.Handler.create_need(
                object.__new__(server.Handler), self.requester,
                {
                    "requesterType": "Individual", "people": 1, "meal": "Bread",
                    "details": "Looking for bread", "location": "Paris, France",
                    "fulfilment": "Pickup works",
                },
            )
        self.assertEqual(result["need"]["location"], "Paris, France")
        self.assertEqual(result["need"]["mapCoordinates"], {"latitude": 48.8566, "longitude": 2.3522})

    def test_groq_key_is_required_and_missing_configuration_is_explicit(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(server.ApiError) as caught:
                server.Handler.ask_assistant(object.__new__(server.Handler), {"prompt": "What food is nearby?"})
        self.assertEqual(caught.exception.status, 503)
        self.assertIn("GROQ_API_KEY", str(caught.exception))

    def test_legacy_browser_data_migrates_once_and_preserves_saved_items(self):
        listing = {
            "id": "donation-123", "title": "Old dal", "category": "Meals", "quantity": 2,
            "unit": "servings", "location": "Kothrud, Pune", "pickup": "Today",
            "source": "Home / household", "description": "Fresh dal", "status": "available",
        }
        request = {
            "id": "need-123", "recipient": "Aditi Sharma", "requesterType": "Individual",
            "people": 1, "meal": "Dinner", "details": "Dinner please", "location": "Kothrud, Pune",
            "fulfilment": "Pickup works", "status": "open",
        }
        legacy = {
            "listings": [listing, {"id": "seed-1"}],
            "needs": [request, {"id": "need-seed-1"}],
            "pickups": [{
                "listingId": listing["id"], "quantity": 1, "title": "Old dal",
                "unit": "servings", "location": "Kothrud, Pune", "pickup": "Today",
                "requestedAt": 123,
            }],
            "saved": [listing["id"]],
        }
        handler = object.__new__(server.Handler)
        first = server.Handler.migrate_legacy_data(handler, self.requester, legacy)
        second = server.Handler.migrate_legacy_data(handler, self.requester, legacy)
        self.assertEqual(first["imported"], {"listings": 1, "needs": 1, "pickups": 1, "saved": 1})
        self.assertEqual(second["imported"], {"listings": 0, "needs": 0, "pickups": 0, "saved": 0})
        state = server.bootstrap(self.requester)
        self.assertTrue(next(item for item in state["listings"] if item["id"] == listing["id"])["isMine"])
        self.assertEqual(len(state["pickups"]), 1)
        self.assertIn(listing["id"], state["saved"])

    def test_groq_receives_redacted_context_and_returns_generated_answer(self):
        server.Handler.create_need(
            object.__new__(server.Handler), self.requester,
            {
                "requesterType": "Individual", "people": 2, "meal": "Dinner",
                "details": "Private note", "location": "Lucknow",
                "fulfilment": "Pickup works", "coordinates": {"latitude": 26.85, "longitude": 80.94},
            },
        )

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return json.dumps({
                    "choices": [{
                        "message": {"role": "assistant", "content": "Lucknow mein dal-rice available hai."},
                    }],
                }).encode()

        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key", "GROQ_MODEL": "test-model"}):
            with patch.object(server, "urlopen", return_value=FakeResponse()) as send:
                result = server.Handler.ask_assistant(
                    object.__new__(server.Handler),
                    {
                        "prompt": "Lucknow ke paas kya milega?", "location": "Lucknow",
                        "history": [{"role": "user", "text": "Namaste"}],
                    },
                )
        self.assertEqual(result["reply"], "Lucknow mein dal-rice available hai.")
        self.assertEqual(result["sources"], [])
        request = send.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.groq.com/openai/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"), "Bearer test-key")
        payload = json.loads(request.data)
        self.assertEqual(payload["model"], "test-model")
        self.assertEqual(payload["max_completion_tokens"], 1200)
        self.assertEqual(payload["messages"][1], {"role": "user", "content": "Namaste"})
        self.assertEqual(payload["messages"][2]["role"], "user")
        self.assertIn("Lucknow ke paas kya milega?", payload["messages"][2]["content"])
        context_text = json.dumps(payload["messages"], ensure_ascii=False)
        self.assertNotIn("Private note", context_text)
        self.assertNotIn("26.85", context_text)

    def test_listing_photo_is_validated_and_persisted(self):
        image = b"\xff\xd8\xff" + b"test photo"
        data = {
            "title": "Fresh dal", "category": "Meals", "quantity": 2, "unit": "servings",
            "location": "Lucknow", "pickup": "Today", "source": "Home / household",
            "description": "Freshly made", "image": "data:image/jpeg;base64," + base64.b64encode(image).decode(),
        }
        result = server.Handler.create_listing(object.__new__(server.Handler), self.donor, data)
        self.assertEqual(result["listing"]["image"], data["image"])
        self.assertTrue(result["listing"]["photoUploaded"])
        saved = next(item for item in server.bootstrap(self.donor)["listings"] if item["id"] == result["listing"]["id"])
        self.assertEqual(saved["image"], data["image"])

    def test_listing_rejects_mismatched_photo_format(self):
        with self.assertRaisesRegex(ValueError, "does not match its image format"):
            server.listing_image({"image": "data:image/png;base64," + base64.b64encode(b"not png").decode()})

    def test_listing_rejects_oversized_photo(self):
        image = b"\xff\xd8\xff" + b"x" * server.MAX_IMAGE_BYTES
        encoded = base64.b64encode(image).decode()
        with self.assertRaisesRegex(ValueError, "smaller than 900 KB"):
            server.listing_image({"image": "data:image/jpeg;base64," + encoded})

    def test_geocoder_uses_identifiable_request_and_caches_location(self):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return json.dumps([{
                    "lat": "26.8467", "lon": "80.9462",
                    "display_name": "Lucknow, Uttar Pradesh, India",
                    "address": {"state": "Uttar Pradesh"},
                }]).encode()

        with patch.object(server, "GEOCODER_INTERVAL", 0):
            with patch.object(server, "_last_geocode_at", 0):
                with patch.object(server, "urlopen", return_value=FakeResponse()) as send:
                    place = self.real_geocoder("Gomti Nagar, Lucknow")
                    cached_place = self.real_geocoder("gomti nagar, lucknow")

        self.assertEqual(place, cached_place)
        self.assertEqual(place["latitude"], 26.8467)
        self.assertEqual(send.call_count, 1)
        request = send.call_args.args[0]
        self.assertIn("Gomti+Nagar%2C+Lucknow", request.full_url)
        self.assertNotIn("countrycodes", request.full_url)
        self.assertEqual(request.get_header("User-agent"), server.GEOCODER_USER_AGENT)

    def test_geocoder_resolves_places_worldwide(self):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return json.dumps([{
                    "lat": "48.8566", "lon": "2.3522",
                    "display_name": "Paris, France",
                    "addresstype": "city",
                    "address": {"state": "Ile-de-France", "country": "France"},
                }]).encode()

        with patch.object(server, "GEOCODER_INTERVAL", 0):
            with patch.object(server, "_last_geocode_at", 0):
                with patch.object(server, "urlopen", return_value=FakeResponse()):
                    place = self.real_geocoder("Paris, France")
        self.assertEqual(place["latitude"], 48.8566)
        self.assertEqual(place["longitude"], 2.3522)
        self.assertEqual(place["country"], "France")
        self.assertEqual(place["zoom"], 11)

    def test_geocoder_reports_unresolvable_place_with_actionable_message(self):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return b"[]"

        with patch.object(server, "GEOCODER_INTERVAL", 0):
            with patch.object(server, "_last_geocode_at", 0):
                with patch.object(server, "urlopen", return_value=FakeResponse()):
                    with self.assertRaises(server.ApiError) as caught:
                        self.real_geocoder("Nowhere-Not-A-Place")
        self.assertEqual(caught.exception.status, 422)
        self.assertIn("city, state, or country", str(caught.exception))

    def test_non_up_post_keeps_its_location_without_statewide_suffix(self):
        with patch.object(server, "geocode_location", return_value={
            "latitude": 48.8566, "longitude": 2.3522, "state": "Ile-de-France",
        }):
            result = server.Handler.create_listing(
                object.__new__(server.Handler), self.donor,
                {
                    "title": "Fresh bread", "category": "Bakery", "quantity": 2, "unit": "loaves",
                    "location": "Paris, France", "pickup": "Today",
                    "source": "Home / household", "description": "Freshly baked bread",
                },
            )
        self.assertEqual(result["listing"]["location"], "Paris, France")
        self.assertEqual(result["listing"]["mapCoordinates"], {"latitude": 48.8566, "longitude": 2.3522})


if __name__ == "__main__":
    unittest.main()
