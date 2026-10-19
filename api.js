(() => {
  const identityKey = "nourishnear-community-id-v1";
  const migrationKey = "nourishnear-backend-migrated-v1";
  function generateUUID() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      try {
        return crypto.randomUUID();
      } catch (e) {
        // Fallback if randomUUID fails
      }
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  let userId = localStorage.getItem(identityKey);
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    userId = generateUUID();
    localStorage.setItem(identityKey, userId);
  }

  async function request(path, body) {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "X-User-Id": userId,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw new Error("The NourishNear server returned an unreadable response.");
    }
    if (!response.ok) throw new Error(result.error || "NourishNear could not complete that request.");
    return result;
  }

  function readLegacy(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (error) {
      console.error(`Could not read legacy NourishNear data from ${key}.`, error);
      return [];
    }
  }

  window.nourishApi = {
    async bootstrap() {
      if (localStorage.getItem(migrationKey) !== "complete") {
        try {
          await request("/api/migrate", {
            listings: readLegacy("nourishnear-listings-v1"),
            needs: readLegacy("nourishnear-needs-v1"),
            pickups: readLegacy("nourishnear-pickups-v1"),
            saved: readLegacy("nourishnear-saved-v1")
          });
          localStorage.setItem(migrationKey, "complete");
        } catch (error) {
          console.warn("Legacy migration skipped:", error);
          localStorage.setItem(migrationKey, "complete");
        }
      }
      return request("/api/bootstrap");
    },
    createListing: listing => request("/api/listings", listing),
    createNeed: need => request("/api/needs", need),
    createPickup: pickup => request("/api/pickups", pickup),
    createOffer: offer => request("/api/offers", offer),
    markReceived: needId => request(`/api/needs/${encodeURIComponent(needId)}/received`, {}),
    toggleSaved: listingId => request("/api/saved", { listingId }),
    askAssistant: question => request("/api/assistant", question),
    geocode: location => request("/api/geocode", { location })
  };
})();
