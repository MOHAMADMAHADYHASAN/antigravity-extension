import Image from 'next/image';

export function Hero() {
  return (
    <div>
      <Image src="/banner.png" layout="fill" />
    </div>
  );
}
