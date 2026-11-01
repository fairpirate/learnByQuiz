#!/usr/bin/env python3
"""Read-only preflight for the Linux VPS. Does not print container environments."""
import ipaddress
import json
import socket
import subprocess
import sys

PORT = 13001
SUBNET = ipaddress.ip_network("172.30.0.0/24")


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    listeners = run("ss", "-H", "-ltn", f"sport = :{PORT}")
    if listeners:
        raise RuntimeError(f"TCP {PORT} is occupied. No services were changed.")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", PORT))
    # Docker can publish ports using NAT without a visible listening process.
    containers = run("docker", "ps", "-q").split()
    if containers:
        # Inspect only the port-binding field; never dump credentials from inspect.
        for container in containers:
            bindings = json.loads(run("docker", "inspect", "--format", "{{json .HostConfig.PortBindings}}", container))
            for entries in (bindings or {}).values():
                if any(entry.get("HostPort") == str(PORT) for entry in entries or []):
                    raise RuntimeError(f"Docker already publishes {PORT}. No containers were changed.")
    owned_bridges = set()
    for network in run("docker", "network", "ls", "-q").split():
        name = run("docker", "network", "inspect", "--format", "{{.Name}}", network)
        configs = json.loads(run("docker", "network", "inspect", "--format", "{{json .IPAM.Config}}", network))
        if name == "learnbyquiz_backend":
            if not any(config.get("Subnet") == str(SUBNET) and config.get("Gateway") == "172.30.0.1" for config in configs or []):
                raise RuntimeError("Existing learnbyquiz_backend has a different subnet/gateway; review before deployment.")
            owned_bridges.add(f"br-{network[:12]}")
        for config in configs or []:
            if config.get("Subnet"):
                existing = ipaddress.ip_network(config["Subnet"], strict=False)
                if existing.version == 4 and existing.overlaps(SUBNET) and name != "learnbyquiz_backend":
                    raise RuntimeError(f"Docker network {name} overlaps {SUBNET}. Choose another subnet/gateway in Compose before proceeding.")
    routes = json.loads(run("ip", "-j", "-4", "route", "show"))
    for route in routes:
        destination = route.get("dst", "default")
        if destination == "default":
            continue
        existing = ipaddress.ip_network(destination, strict=False)
        # A matching Docker route is expected after this project's first run.
        if existing.overlaps(SUBNET) and not (existing == SUBNET and route.get("dev") in owned_bridges):
            raise RuntimeError(f"Host route {destination} overlaps {SUBNET}. Review network allocation before deploying.")
    print(f"Preflight passed: 127.0.0.1:{PORT} is available and {SUBNET} has no conflicting allocation.")
    print("Ports 80/443 remain managed by existing Nginx. No services or firewall rules were changed.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, subprocess.CalledProcessError, ValueError, RuntimeError) as error:
        print(f"Preflight failed: {error}", file=sys.stderr)
        sys.exit(1)
