
const BASE_URL = "http://localhost:3000/api/bookings";

// Replace these placeholders with a valid OWNER JWT
// from your development login. Never share the token here.
const OWNER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhYzg0YjJkZWMzODU2NjdiNjlhM2VkYSIsInJvbGUiOiJvd25lciIsImlhdCI6MTc5MTcxMDA4NSwiZXhwIjoxNzkyMzE0ODg1fQ.lR6llw2kz2XIVscWgK6w95gnVOEjwweRAQ_IbY6nNMg";

const bookingIds = [
  "6aca23a66b1f818893ce17bb",
  "6aca23a66b1f818893ce17bc",
];

async function approveBooking(bookingId) {
  try {
    const response = await fetch(
      `${BASE_URL}/${bookingId}/approve`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${OWNER_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    return {
      bookingId,
      httpStatus: response.status,
      response: data,
    };
  } catch (error) {
    return {
      bookingId,
      error: error.message,
    };
  }
}

async function main() {
  console.log("Sending both approval requests concurrently...\n");

  console.log("Testing API connection...");
  console.log(await fetch("http://localhost:3000/").then(
    (response) => `HTTP ${response.status}`
  ));

  const authResponse = await fetch("http://localhost:3000/api/bookings", {
    headers: {
      Authorization: `Bearer ${OWNER_TOKEN}`,
    },
  });

  console.log("Authenticated bookings endpoint:", authResponse.status);
  console.log(await authResponse.json());

  const results = await Promise.all(
    bookingIds.map((id) => approveBooking(id))
  );

  for (const result of results) {
    console.log(JSON.stringify(result, null, 2));
  }
}

main();
