import serial
import time
import sys

PORT = "COM16"
BAUD = 115200

print("\n=======================================================")
print("  BeeLine Moto II - Live Telemetry Interactive Controller")
print("=======================================================\n")

try:
    ser = serial.Serial(PORT, BAUD, timeout=1)
    time.sleep(1.5)
    print(f"[SUCCESS] Connected to BeeLine hardware on {PORT} @ {BAUD} baud!\n")
    print("Type HELP for available commands, or enter a command below:")
    print("Examples:")
    print("  TURN 1      (0=Straight, 1=Left, 2=Right, 3=UTurn, 4=SlightLeft, 5=SlightRight, 6=Arrived)")
    print("  DIST 120    (Set distance countdown in meters)")
    print("  SPEED 60    (Set speed limit badge)")
    print("  PROGRESS 80 (Set overall trip progress arc %)")
    print("  POI 2 65 90 (Set POI badge: 1=Parking, 2=Fuel, 3=EV, 4=Hazard, 5=Destination)")
    print("  BLE 1       (Toggle BLE blue connected / gray disconnected)")
    print("  AUTO        (Return to 50 FPS automatic demo simulation)")
    print("  QUIT        (Exit controller)\n")

    ser.write(b"HELP\n")
    time.sleep(0.3)
    while ser.in_waiting:
        print(ser.readline().decode('utf-8', errors='ignore'), end='')

    while True:
        try:
            cmd = input("\nBeeLine Telemetry > ").strip()
            if not cmd:
                continue
            if cmd.upper() in ["QUIT", "EXIT"]:
                print("Exiting controller...")
                break

            ser.write((cmd + "\n").encode('utf-8'))
            time.sleep(0.3)

            while ser.in_waiting:
                print(ser.readline().decode('utf-8', errors='ignore'), end='')
        except KeyboardInterrupt:
            print("\nExiting controller...")
            break

    ser.close()

except Exception as e:
    print(f"[ERROR] Could not connect to {PORT}: {e}")
    sys.exit(1)
