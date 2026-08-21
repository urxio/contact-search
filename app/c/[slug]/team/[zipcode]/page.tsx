import TeamZipcode from "@/app/territories/[zipcode]/page"

export default function CongregationZipcodePage({ params }: { params: { zipcode: string } }) {
  return <TeamZipcode params={{ zipcode: params.zipcode }} />
}
