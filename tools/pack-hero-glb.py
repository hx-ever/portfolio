"""Repack hxever's Blender export with the original mesh, texture and clip timing."""

import argparse
import json
import math
from pathlib import Path
import struct

CLIPS = {"Walk", "Idle", "Sad", "Win", "Dance"}
# Blender bakes tiny numeric fluctuations into held channels. Keep only the
# endpoints when every sample is within one millionth of the first value.
HELD_CHANNEL_TOLERANCE = 1e-6


def read_glb(source):
    data = source.read_bytes()
    magic, version, length, json_len, json_type = struct.unpack_from("<4sIII4s", data)
    if (magic, version, length, json_type) != (b"glTF", 2, len(data), b"JSON"):
        raise ValueError("Expected a glTF 2.0 binary file")
    json_end = 20 + json_len
    bin_len, bin_type = struct.unpack_from("<I4s", data, json_end)
    if bin_type != b"BIN\0" or json_end + 8 + bin_len != len(data):
        raise ValueError("Expected a single embedded binary buffer")
    return json.loads(data[20:json_end]), data[json_end + 8:]


def pack(source, output):
    model, data = read_glb(source)
    if model.get("extensionsUsed") or len(model["buffers"]) != 1:
        raise ValueError("Expected an uncompressed export with one buffer")

    model["animations"] = [clip for clip in model["animations"] if clip["name"] in CLIPS]
    if len(model["animations"]) != len(CLIPS) or {clip["name"] for clip in model["animations"]} != CLIPS:
        raise ValueError("The export must contain all five website clips")

    old_views = model.pop("bufferViews")
    old_accessors = model.pop("accessors")
    views = model["bufferViews"] = []
    accessors = model["accessors"] = []
    binary = bytearray()
    view_keys = {}
    accessor_keys = {}

    def view_payload(index):
        view = old_views[index]
        offset = view.get("byteOffset", 0)
        return data[offset:offset + view["byteLength"]]

    def copy_view(index, payload=None):
        view = old_views[index].copy()
        view.pop("byteOffset", None)
        if payload is None:
            payload = view_payload(index)
        view["byteLength"] = len(payload)
        key = (json.dumps(view, sort_keys=True), payload)
        if key not in view_keys:
            view_keys[key] = len(views)
            view["byteOffset"] = len(binary)
            views.append(view)
            binary.extend(payload)
            binary.extend(b"\0" * (-len(binary) % 4))
        return view_keys[key]

    def copy_accessor(index, payload=None, endpoints=None):
        accessor = old_accessors[index].copy()
        if "sparse" in accessor:
            raise ValueError("Sparse accessors are not supported by this packer")
        accessor["bufferView"] = copy_view(accessor["bufferView"], payload)
        if endpoints is not None:
            start, end = endpoints
            accessor["count"] = 2
            if "min" in accessor:
                accessor["min"] = list(start)
            if "max" in accessor:
                accessor["max"] = list(end)
        key = json.dumps(accessor, sort_keys=True)
        if key not in accessor_keys:
            accessor_keys[key] = len(accessors)
            accessors.append(accessor)
        return accessor_keys[key]

    def held_channel(sampler):
        if sampler.get("interpolation", "LINEAR") != "LINEAR":
            return None
        time = old_accessors[sampler["input"]]
        values = old_accessors[sampler["output"]]
        dimensions = {"VEC3": 3, "VEC4": 4}.get(values["type"])
        if (
            dimensions is None or values["count"] != time["count"] or values["count"] < 3
            or values["componentType"] != 5126 or time["componentType"] != 5126
            or values.get("byteOffset", 0) or time.get("byteOffset", 0)
            or "byteStride" in old_views[values["bufferView"]]
            or "byteStride" in old_views[time["bufferView"]]
        ):
            return None
        samples = view_payload(values["bufferView"])
        sample_format = "<" + "f" * dimensions
        frames = struct.iter_unpack(sample_format, samples)
        first = next(frames)
        if any(
            abs(value - reference) > HELD_CHANNEL_TOLERANCE
            for frame in frames for value, reference in zip(frame, first)
        ):
            return None
        times = view_payload(time["bufferView"])
        start = struct.unpack_from("<f", times)
        end = struct.unpack_from("<f", times, len(times) - 4)
        return (
            copy_accessor(sampler["input"], times[:4] + times[-4:], (start, end)),
            copy_accessor(sampler["output"], samples[:dimensions * 4] * 2, (first, first)),
        )

    for mesh in model["meshes"]:
        for primitive in mesh["primitives"]:
            attributes = primitive["attributes"]
            positions = view_payload(old_accessors[attributes["POSITION"]]["bufferView"])
            uv = view_payload(old_accessors[attributes["TEXCOORD_0"]]["bufferView"])
            # The collar is a separate layer over the jacket. Give its upper
            # seam clearance so the surfaces don't cross as the shoulders bend.
            vertices = list(struct.iter_unpack("<3f", positions))
            for i, ((x, y, z), (u, v)) in enumerate(zip(vertices, struct.iter_unpack("<2f", uv))):
                if abs(u - .73466) < .0001 and .382 < v < .392 and y > 1.35:
                    blend = min(1, (y - 1.35) / .04)
                    radius = max(math.hypot(x, z + .02), .01)
                    vertices[i] = (x + .006 * blend * x / radius, y + .006 * blend,
                                   z + .006 * blend * (z + .02) / radius)
            position_index = copy_accessor(
                attributes["POSITION"], b"".join(struct.pack("<3f", *p) for p in vertices)
            )
            primitive["attributes"] = {
                name: position_index if name == "POSITION" else copy_accessor(index)
                for name, index in attributes.items()
            }
            if "indices" in primitive:
                primitive["indices"] = copy_accessor(primitive["indices"])
            if "targets" in primitive:
                primitive["targets"] = [
                    {name: copy_accessor(index) for name, index in target.items()}
                    for target in primitive["targets"]
                ]

    for skin in model["skins"]:
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = copy_accessor(skin["inverseBindMatrices"])

    for image in model["images"]:
        image["bufferView"] = copy_view(image["bufferView"])

    for clip in model["animations"]:
        for sampler in clip["samplers"]:
            packed = held_channel(sampler)
            if packed is None:
                packed = (copy_accessor(sampler["input"]), copy_accessor(sampler["output"]))
            sampler["input"], sampler["output"] = packed

    model["buffers"][0]["byteLength"] = len(binary)
    metadata = json.dumps(model, separators=(",", ":"), ensure_ascii=False).encode()
    metadata += b" " * (-len(metadata) % 4)
    header = struct.pack("<4sIII4s", b"glTF", 2, 28 + len(metadata) + len(binary), len(metadata), b"JSON")
    output.write_bytes(header + metadata + struct.pack("<I4s", len(binary), b"BIN\0") + binary)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    pack(args.source, args.output)
