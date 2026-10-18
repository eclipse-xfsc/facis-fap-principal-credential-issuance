# FAP PCI container image

## Distribution

| Item | Value |
|---|---|
| Registry | Docker Hub |
| Repository | [ecofacis/fap-pci](https://hub.docker.com/r/ecofacis/fap-pci) |
| Release tag | `ecofacis/fap-pci:1.0.0` |
| ORCE packaging base | `ecofacis/xfsc-orce:2.0.15` |
| Application source version | `0.5.0-rc.12` |

The 1.0.0 packaging procedure captures the running ORCE container filesystem and explicitly copies `/data` into the resulting image before publication. This includes PCI flows, UI/configuration and the installed dependencies present in that release snapshot. Docker commit alone omits mounted-volume contents; the separate `/data` embedding step is part of this package's preparation.

The image tag names a container package. `VERSION`, `package.json` and `/healthz` identify the application source/runtime version. A hot-installed PCI release can differ from the enclosing ORCE Deployment's image tag. Record both when inventorying an environment.

## Pull and record the immutable reference

```bash
docker pull ecofacis/fap-pci:1.0.0
docker image inspect ecofacis/fap-pci:1.0.0 \
  --format '{{json .RepoDigests}}'
docker image inspect ecofacis/fap-pci:1.0.0 \
  --format '{{json .Config}}'
```

Record the registry digest returned by the pull and use that exact digest in the deployment record. Tags can be reassigned. The configuration inspection identifies the image's actual entrypoint, command, exposed ports and declared volumes. This guide does not invent a digest or infer architecture support from a tag name.

## Persistent data and deployment

The image supplies the packaged `/data` snapshot. A bind mount or PVC at `/data` takes precedence over image files at that path. Initialize a fresh persistent volume using the approved [G0 storage preparation](deployment.md) or an explicit migration of the packaged data. Preserve an existing instance's data and configuration during upgrades.

Supply cluster API access, database connections, identity endpoints, certificates and other deployment settings through the established runtime configuration and Kubernetes Secrets. Keep private credentials and participant records outside source control. Release preparation includes reviewing the embedded filesystem and replacing environment-specific credentials with runtime-managed configuration.

Use one active ORCE replica with the documented Recreate/PVC profile. Process-local offers, callbacks and input values require the [runtime lifecycle](../architecture/issuer-runtime.md) and [transport configuration](transport.md) described for PCI. The container does not replace the shared OCM services or the separately deployed participant repository.

After installation, verify `/healthz`, `/readyz`, provider and tenant routes, authentication and issuer metadata. Use the [completion tests](../testing/completion.md) for request, offer, presentation and lifecycle checks. Record the running image digest and runtime version alongside each test result.

## Packaging record

The publication procedure builds and pushes `ecofacis/fap-pci:1.0.0` after the filesystem and `/data` capture. The [release record](../release/1.0.0.md) describes this distribution; [source provenance](../source-baseline.md) identifies the reviewed repository baseline. A container digest, source commit and runtime version are separate provenance fields and should be captured together by the release operator.
