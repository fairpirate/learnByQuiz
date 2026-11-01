import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("preflight", ROOT / "deploy/check-vps.py")
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class PortSafety(unittest.TestCase):
    def check(self, listeners="", containers="", bindings=None, networks="", routes=None):
        def command(*args):
            if args[0] == "ss":
                return listeners
            if args[:3] == ("docker", "ps", "-q"):
                return containers
            if args[:2] == ("docker", "inspect"):
                return json.dumps(bindings)
            if args[:3] == ("docker", "network", "ls"):
                return networks
            if args[0] == "ip":
                return json.dumps(routes or [])
            raise AssertionError(args)
        with patch.object(preflight, "run", side_effect=command), patch.object(preflight.socket, "socket", return_value=MagicMock()):
            preflight.main()

    def test_occupied_listener_aborts(self):
        with self.assertRaisesRegex(RuntimeError, "occupied"):
            self.check(listeners="LISTEN 0 4096 127.0.0.1:13001")

    def test_docker_nat_allocation_aborts_without_a_listener(self):
        with self.assertRaisesRegex(RuntimeError, "Docker already publishes"):
            self.check(containers="container", bindings={"3001/tcp": [{"HostPort": "13001"}]})

    def test_unrelated_ports_and_default_route_are_allowed(self):
        self.check(containers="container", bindings={"3001/tcp": [{"HostPort": "4100"}]}, routes=[{"dst": "default"}, {"dst": "162.35.172.0/24"}])

    def test_conflicting_vpn_route_aborts(self):
        with self.assertRaisesRegex(RuntimeError, "Host route"):
            self.check(routes=[{"dst": "172.30.0.0/16", "dev": "tun0"}])

    def test_an_unowned_bridge_route_aborts(self):
        with self.assertRaisesRegex(RuntimeError, "Host route"):
            self.check(routes=[{"dst": "172.30.0.0/24", "dev": "br-other"}])

    def test_another_docker_network_cannot_share_the_subnet(self):
        with patch.object(preflight, "run") as run, patch.object(preflight.socket, "socket", return_value=MagicMock()):
            run.side_effect = ["", "", "network-id", "other-project", '[{"Subnet":"172.30.0.0/24","Gateway":"172.30.0.1"}]']
            with self.assertRaisesRegex(RuntimeError, "Docker network"):
                preflight.main()


if __name__ == "__main__":
    unittest.main()
