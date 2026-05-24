import requests
import time

NODE_URL = "http://localhost:3000/api/submit"

print("========================================")
print("[START] RUNNING END-TO-END CHAIN DISCOVERY TEST")
print("========================================\n")

# --- TIP 1: From Alice ---
print(">>> Sending Tip 1 (Device A: Alice's iPhone)")
tip1_payload = {
    "coordinates": {"lat": 25.2048, "lng": 55.2708},
    "rawNarrative": "I saw a guy selling drugs out of a black Honda Civic.",
    "categories": ["drugs", "vehicle"],
    "interviewTranscript": [
        {"role": "assistant", "content": "Can you provide the license plate?"},
        {"role": "user", "content": "Yes, it was KL-07-BB-5555."},
        {"role": "assistant", "content": "Did you catch his name?"},
        {"role": "user", "content": "I heard someone call him 'Snake'."}
    ]
}

res1 = requests.post(
    NODE_URL, 
    json=tip1_payload, 
    headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)"}
)
print(f"Tip 1 Response: {res1.status_code}")
print(res1.json())
print("\nWaiting 5 seconds for processing...\n")
time.sleep(5)


# --- TIP 2: From Bob ---
print(">>> Sending Tip 2 (Device B: Bob's Android)")
tip2_payload = {
    "coordinates": {"lat": 25.2045, "lng": 55.2701}, # Slightly different location
    "rawNarrative": "There is a shady black car parked near the school.",
    "categories": ["suspicious"],
    "interviewTranscript": [
        {"role": "assistant", "content": "What is the license plate of the car?"},
        {"role": "user", "content": "It's KL-07-BB-5555."},
        {"role": "assistant", "content": "What did the driver look like?"},
        {"role": "user", "content": "Tall guy, bald, he had a tattoo of a snake on his neck."}
    ]
}

res2 = requests.post(
    NODE_URL, 
    json=tip2_payload, 
    headers={"User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-S918B)"}
)
print(f"Tip 2 Response: {res2.status_code}")
print(res2.json())
print("\nWaiting 5 seconds for graph injection...\n")
time.sleep(5)


# --- CHECK DASHBOARD ALERTS ---
print(">>> Checking Dashboard for Active Chains...")
alerts_res = requests.get("http://localhost:3000/api/dashboard/alerts")
alerts = alerts_res.json()

print(f"\nFound {len(alerts)} Active Chains:")
for a in alerts:
    print(f" - CHAIN DETECTED: Devices linked via {a['shared_type']} -> {a['shared_entity']} (Confidence: {a['confidence_score']})")

print("\n[SUCCESS] Test Complete!")
